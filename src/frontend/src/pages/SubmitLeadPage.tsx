import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { campaignService, submissionService } from '@/services';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import { Loader2, Phone, PhoneCall, PhoneOff, RefreshCw } from 'lucide-react';
import type { Campaign, CampaignField } from '@/types';
import { cn } from '@/lib/utils';

// Max times an agent may re-ping the system before we tell them to stop.
const MAX_PINGS = 8;

// Decide whether to send the call. CallGrid code 1000 = agent available.
// Ringba returns only "status: ok" (sent) — no code gating.
const deriveAvailability = (r: any) => {
  if (r?.availability) return r.availability;
  const dr = r?.destinationResults || {};
  const cg = dr.callgrid;
  if (cg) {
    const code = cg.response?.code;
    const available = !!cg.sent && code === 1000;
    return {
      agentAvailable: available,
      code: code ?? null,
      phoneNumber: cg.response?.phoneNumber || null,
      message: available ? 'Agent available — SEND THE CALL.' : 'No agents available — do not send the call.',
    };
  }
  const rb = dr.ringba || dr.ringbaRtb;
  if (rb) return { agentAvailable: !!rb.sent, code: null, phoneNumber: null, message: rb.sent ? 'Lead accepted — send the call.' : 'Not accepted.' };
  return { agentAvailable: r?.status === 'sent', code: null, phoneNumber: null, message: '' };
};

// ── Phone cleaning ──────────────────────────────────────────────────────────────
const cleanPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

// ── Types that should NEVER be rendered as form inputs ─────────────────────────
// Includes 'conditional' for backwards compat with old DB records
const SKIP_TYPES = new Set([
  'token_jornaya', 'token_trustedform', 'hidden',
  'static_value', 'api_autofill',
  'conditional', // legacy — should be 'number' after migration, skip if still present
]);

// ── Types that take full width (not paired in 2-col grid) ──────────────────────
const FULL_WIDTH = new Set(['textarea', 'radio', 'checkbox']);

// ── Evaluate which fields are currently visible ────────────────────────────────
const evaluateVisible = (fields: CampaignField[], values: Record<string, any>): Set<string> => {
  const visible = new Set<string>();

  // All renderable fields visible by default
  for (const cf of fields) {
    const f = cf.field;
    if (!f || SKIP_TYPES.has(f.type)) continue;
    visible.add(f.key);
  }

  // Apply conditional rules from each source field
  for (const cf of fields) {
    const field = cf.field;
    if (!field || !(field as any).conditionalRules?.length) continue;

    for (const rule of (field as any).conditionalRules) {
      // sourceFieldKey defaults to the field's own key if missing or wrong case
      const sourceKey = (rule.sourceFieldKey && rule.sourceFieldKey !== field.label)
        ? rule.sourceFieldKey
        : field.key;
      const sourceVal = values[sourceKey];

      let matches = false;
      switch (rule.operator) {
        case 'eq':       matches = String(sourceVal ?? '') === String(rule.value ?? ''); break;
        case 'neq':      matches = String(sourceVal ?? '') !== String(rule.value ?? ''); break;
        case 'gt':       matches = Number(sourceVal) >  Number(rule.value); break;
        case 'gte':      matches = Number(sourceVal) >= Number(rule.value); break;
        case 'lt':       matches = Number(sourceVal) <  Number(rule.value); break;
        case 'lte':      matches = Number(sourceVal) <= Number(rule.value); break;
        case 'contains': matches = String(sourceVal ?? '').includes(String(rule.value ?? '')); break;
        case 'exists':   matches = sourceVal !== undefined && sourceVal !== null && sourceVal !== ''; break;
      }

      if (rule.action === 'show') {
        if (matches) visible.add(rule.targetFieldKey);
        else         visible.delete(rule.targetFieldKey);
      }
      if (rule.action === 'hide')    { if (matches) visible.delete(rule.targetFieldKey); }
      if (rule.action === 'require') { if (matches) visible.add(rule.targetFieldKey); }
    }
  }

  return visible;
};

// ── Group into 2-per-row, full-width types span whole row ──────────────────────
const buildRows = (fields: CampaignField[]): CampaignField[][] => {
  const rows: CampaignField[][] = [];
  let i = 0;
  while (i < fields.length) {
    const cf = fields[i];
    if (FULL_WIDTH.has(cf.field?.type)) {
      rows.push([cf]); i++;
    } else if (i + 1 < fields.length && !FULL_WIDTH.has(fields[i + 1]?.field?.type)) {
      rows.push([cf, fields[i + 1]]); i += 2;
    } else {
      rows.push([cf]); i++;
    }
  }
  return rows;
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function SubmitLeadPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result,    setResult]    = useState<any>(null);
  const [pingCount, setPingCount] = useState(0);
  const [lastData,  setLastData]  = useState<Record<string, unknown> | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['my-campaigns'],
    queryFn:  () => campaignService.getAll({ isActive: true, limit: 100 }),
  });
  const campaigns: Campaign[] = campaignsData?.data?.data || [];

  const { data: campaignData, isLoading: loadingCampaign } = useQuery({
    queryKey: ['campaign-detail', selectedCampaignId],
    queryFn:  () => campaignService.getOne(selectedCampaignId),
    enabled:  Boolean(selectedCampaignId),
  });

  const campaign = campaignData?.data?.data?.campaign;

  // All campaign fields, null-safe, sorted
  const allFields: CampaignField[] = (campaign?.fields || [])
    .filter((cf: CampaignField) => cf.field != null)
    .sort((a: CampaignField, b: CampaignField) => a.order - b.order);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm({ mode: 'onChange' });

  // Live watch for conditional evaluation
  const formValues = useWatch({ control }) as Record<string, any>;

  useEffect(() => { reset(); }, [selectedCampaignId, reset]);

  // Compute visible fields
  const visibleKeys = evaluateVisible(allFields, formValues);

  const visibleFields = allFields.filter((cf) => {
    if (!cf.field) return false;
    if (SKIP_TYPES.has(cf.field.type)) return false;
    return visibleKeys.has(cf.field.key);
  });

  // Find conditional target fields that are missing from the campaign (not added in Campaign Builder)
  const missingTargets: string[] = [];
  for (const cf of allFields) {
    const rules = (cf.field as any)?.conditionalRules || [];
    for (const rule of rules) {
      if (rule.targetFieldKey && visibleKeys.has(rule.targetFieldKey)) {
        const exists = allFields.some((f) => f.field?.key === rule.targetFieldKey);
        if (!exists && !missingTargets.includes(rule.targetFieldKey)) {
          missingTargets.push(rule.targetFieldKey);
        }
      }
    }
  }

  const submitMutation = useMutation({
    mutationFn: (formData: Record<string, unknown>) => {
      const cleaned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(formData)) {
        const fieldDef = allFields.find((cf) => cf.field?.key === key);
        if (fieldDef?.field?.type === 'phone' && typeof val === 'string') {
          cleaned[key] = cleanPhone(val);
        } else {
          cleaned[key] = val;
        }
      }
      return submissionService.submit(selectedCampaignId, cleaned);
    },
    onSuccess: (res) => { setResult(res.data.data); setSubmitted(true); toast.success('Lead submitted!'); },
    onError:   (err: any) => toast.error(err.response?.data?.message || 'Submission failed.'),
  });

  // ── Render a single field ────────────────────────────────────────────────────
  const renderField = (cf: CampaignField) => {
    const field = cf.field;

    // Extra safety — skip anything we don't know how to render
    if (!field || SKIP_TYPES.has(field.type)) return null;

    const label       = cf.overrideLabel      || field.label;
    const placeholder = cf.overridePlaceholder || field.placeholder;

    // A field is required if explicitly set, or a conditional 'require' action is active
    const isConditionallyRequired = allFields.some((src) =>
      (src.field as any)?.conditionalRules?.some((r: any) =>
        r.targetFieldKey === field.key && r.action === 'require' && visibleKeys.has(field.key)
      )
    );
    const required = cf.isRequired || isConditionallyRequired;
    const error    = (errors as any)[field.key];

    // Phone — custom validation + hint
    if (field.type === 'phone') {
      return (
        <div className="space-y-1.5">
          <Label htmlFor={field.key}>
            {label}{required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Input
            id={field.key}
            type="tel"
            placeholder={placeholder || '(555) 000-0000'}
            {...register(field.key, {
              required: required ? `${label} is required` : false,
              validate: (v) => {
                if (!v && !required) return true;
                return cleanPhone(v).length === 10 ? true : 'Enter a valid 10-digit US phone number';
              },
            })}
          />
          {error && <p className="text-xs text-destructive">{error.message}</p>}
        </div>
      );
    }

    const fieldReg = register(field.key, { required: required ? `${label} is required` : false });

    return (
      <div className="space-y-1.5">
        <Label htmlFor={field.key}>
          {label}{required && <span className="text-destructive ml-0.5">*</span>}
        </Label>

        {['text', 'email', 'number', 'date'].includes(field.type) && (
          <Input id={field.key} type={field.type} placeholder={placeholder} {...fieldReg} />
        )}

        {field.type === 'textarea' && (
          <Textarea id={field.key} placeholder={placeholder} rows={3} {...fieldReg} />
        )}

        {field.type === 'select' && (field.options?.length ?? 0) > 0 && (
          <Controller name={field.key} control={control}
            rules={{ required: required ? `${label} is required` : false }}
            render={({ field: f }) => (
              <Select onValueChange={f.onChange} value={f.value || ''}>
                <SelectTrigger id={field.key}>
                  <SelectValue placeholder={`Select ${label}...`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options!.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        )}

        {field.type === 'radio' && (field.options?.length ?? 0) > 0 && (
          <Controller name={field.key} control={control}
            rules={{ required: required ? `${label} is required` : false }}
            render={({ field: f }) => (
              <div className="flex flex-wrap gap-4 pt-1">
                {field.options!.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={opt.value} checked={f.value === opt.value}
                      onChange={() => f.onChange(opt.value)} className="accent-primary" />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          />
        )}

        {field.type === 'checkbox' && (field.options?.length ?? 0) > 0 && (
          <Controller name={field.key} control={control}
            rules={{ required: required ? `${label} is required` : false }}
            render={({ field: f }) => (
              <div className="flex flex-wrap gap-4 pt-1">
                {field.options!.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" value={opt.value}
                      checked={Array.isArray(f.value) ? f.value.includes(opt.value) : false}
                      onChange={(e) => {
                        const cur = Array.isArray(f.value) ? f.value : [];
                        f.onChange(e.target.checked ? [...cur, opt.value] : cur.filter((v: string) => v !== opt.value));
                      }} className="accent-primary rounded" />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            )}
          />
        )}

        {field.type === 'checkbox' && !(field.options?.length) && (
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" {...fieldReg} className="accent-primary rounded" />
            <span className="text-sm">{placeholder || label}</span>
          </label>
        )}

        {error && <p className="text-xs text-destructive">{error.message}</p>}
      </div>
    );
  };

  // ── Re-ping: re-send the same lead to check availability again ─────────────────
  const rePing = () => {
    if (!lastData) return;
    setPingCount((c) => c + 1);
    submitMutation.mutate(lastData);
  };

  const resetForm = () => {
    setSubmitted(false); setResult(null); setPingCount(0); setLastData(null); reset();
  };

  // ── Result screen — agent availability + call decision ─────────────────────────
  if (submitted && result) {
    const avail     = deriveAvailability(result);
    const available = !!avail.agentAvailable;
    const pingsLeft = MAX_PINGS - pingCount;
    const exhausted = pingsLeft <= 0;

    return (
      <div className="page-container max-w-lg">
        <Card className="shadow-md overflow-hidden">
          {/* Availability banner — green = send, flashing red = don't send */}
          <div className={cn('p-7 text-center text-white', available ? 'bg-emerald-500' : 'bg-red-600 animate-pulse')}>
            {available ? (
              <>
                <PhoneCall className="h-10 w-10 mx-auto mb-2" />
                <h2 className="text-2xl font-extrabold tracking-tight">AGENT AVAILABLE</h2>
                <p className="mt-1 text-emerald-50">Send the call now{avail.phoneNumber ? ' to:' : '.'}</p>
                {avail.phoneNumber && <p className="mt-1 text-2xl font-mono font-bold">{avail.phoneNumber}</p>}
              </>
            ) : (
              <>
                <PhoneOff className="h-10 w-10 mx-auto mb-2" />
                <h2 className="text-2xl font-extrabold tracking-tight">NO AGENTS AVAILABLE</h2>
                <p className="mt-1 text-red-50 font-medium">DO NOT send the call.</p>
              </>
            )}
          </div>

          <CardContent className="py-6 space-y-4">
            <p className="text-sm text-center text-muted-foreground">{avail.message}</p>

            <div className="p-4 rounded-xl bg-slate-50 border text-sm space-y-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submission ID</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{result.submissionId}</code>
              </div>
              {avail.code != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CallGrid code</span>
                  <span className="font-semibold">{avail.code}{avail.code === 1000 ? ' (available)' : ' (no agent)'}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className={cn('font-semibold', result.status === 'sent' ? 'text-emerald-600' : 'text-red-500')}>
                  {result.status === 'sent' ? '✓ Sent' : '✗ Failed'}
                </span>
              </div>
              {result.isDuplicate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Note</span>
                  <span className="text-amber-600 font-medium">Duplicate · attempt {result.attemptCount ?? '—'}</span>
                </div>
              )}
            </div>

            {/* Keep pinging until an agent frees up (capped) */}
            {!available && !exhausted && (
              <div className="space-y-1.5">
                <Button onClick={rePing} loading={submitMutation.isPending} size="lg"
                  className="w-full bg-red-600 hover:bg-red-500 text-white">
                  <RefreshCw className="h-4 w-4 mr-2" /> Ping again ({pingsLeft} left)
                </Button>
                <p className="text-xs text-center text-muted-foreground">Keep pinging the system until an agent becomes available.</p>
              </div>
            )}
            {!available && exhausted && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-center text-red-700 space-y-1">
                <p className="font-semibold">No agents available at the moment. Please call back later.</p>
                <p className="text-xs text-red-600">Retries are blocked for this number ({MAX_PINGS} attempts used). You can still submit new leads below.</p>
              </div>
            )}

            <div className="flex gap-3 justify-center pt-1">
              <Button variant="outline" onClick={resetForm}>Submit Another</Button>
              <Button variant="ghost" onClick={() => window.location.href = '/submissions'}>View Submissions</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  return (
    <div className="page-container max-w-3xl space-y-6">

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md shadow-blue-600/20">
          <Phone className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="section-title">Submit Lead</h1>
          <p className="text-sm text-muted-foreground">Select a campaign and fill in lead details.</p>
        </div>
      </div>

      {/* Campaign selector */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <div className="space-y-2">
            <Label className="font-medium">Campaign *</Label>
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select a campaign..." />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {campaign && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{visibleFields.length} fields</span>
              {campaign.jornayaEnabled     && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Jornaya</span>}
              {campaign.trustedFormEnabled && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">TrustedForm</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dynamic form */}
      {selectedCampaignId && (
        loadingCampaign ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : campaign && visibleFields.length > 0 ? (
          <form onSubmit={handleSubmit((d) => { setLastData(d as Record<string, unknown>); setPingCount(0); submitMutation.mutate(d as Record<string, unknown>); })}>
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-5 px-6">
                <CardTitle className="text-base font-semibold">{campaign.name}</CardTitle>
              </CardHeader>
              <CardContent className="px-6 pb-6 pt-3 space-y-4">
                {/* Warning: conditional target fields not added to campaign */}
                {missingTargets.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold mb-1">⚠ Missing conditional field{missingTargets.length > 1 ? 's' : ''} in campaign</p>
                    <p>
                      The following field{missingTargets.length > 1 ? 's are' : ' is'} referenced by conditional rules but
                      {' '}not added to this campaign in Campaign Builder:{' '}
                      {missingTargets.map((k) => <code key={k} className="bg-amber-100 px-1 rounded mx-0.5">{k}</code>)}
                    </p>
                    <p className="mt-1 text-amber-700">Go to Campaign Builder → Step 3 and add the missing field(s).</p>
                  </div>
                )}
                {buildRows(visibleFields).map((row, rowIdx) =>
                  row.length === 2 ? (
                    <div key={rowIdx} className="grid grid-cols-2 gap-4">
                      {row.map((cf) => <div key={cf.field._id}>{renderField(cf)}</div>)}
                    </div>
                  ) : (
                    <div key={rowIdx}>{renderField(row[0])}</div>
                  )
                )}
              </CardContent>
            </Card>

            <div className="mt-5 flex justify-end">
              <Button type="submit" loading={submitMutation.isPending} size="lg"
                className="px-10 bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20">
                Submit Lead
              </Button>
            </div>
          </form>
        ) : selectedCampaignId && !loadingCampaign ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No visible fields for this campaign.
            </CardContent>
          </Card>
        ) : null
      )}
    </div>
  );
}