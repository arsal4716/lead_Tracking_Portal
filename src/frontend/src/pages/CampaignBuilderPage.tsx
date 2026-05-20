import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { campaignService, publisherService, fieldService } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import {
  CheckCircle, ChevronRight, ChevronLeft, Building2,
  Zap, Layers, Settings, GripVertical, X, Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Field, Publisher, DestinationParams, CampaignDestination } from '@/types';

const DESTINATION_OPTIONS = [
  { value: 'ringba_regular',              label: 'Ringba Regular (Enrich)', color: 'text-blue-600' },
  { value: 'ringba_rtb',                  label: 'Ringba RTB',              color: 'text-purple-600' },
  { value: 'callgrid',                    label: 'CallGrid',                color: 'text-emerald-600' },
  { value: 'ringba_regular_and_callgrid', label: 'Ringba Regular + CallGrid (both)', color: 'text-orange-600' },
  { value: 'ringba_rtb_and_callgrid',     label: 'Ringba RTB + CallGrid (both)',    color: 'text-pink-600' },
];

const schema = z.object({
  name:               z.string().min(2, 'Campaign name is required'),
  publisher:          z.string().min(1, 'Publisher is required'),
  destination:        z.string().min(1, 'Destination is required'),
  ringbaId:           z.string().optional(),
  ringbaRtbUrl:       z.string().optional(),
  callgridUrl:        z.string().optional(),
  isActive:           z.boolean().default(true),
  jornayaEnabled:     z.boolean().default(false),
  trustedFormEnabled: z.boolean().default(false),
  description:        z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface SelectedField {
  field:             Field;
  isRequired:        boolean;
  order:             number;
  includeInRingba:   boolean;
  destinationParams: DestinationParams;
}

const STEPS = [
  { id: 1, label: 'Campaign',     icon: Building2   },
  { id: 2, label: 'Destination',  icon: Zap         },
  { id: 3, label: 'Fields',       icon: Layers      },
  { id: 4, label: 'Settings',     icon: Settings    },
  { id: 5, label: 'Review',       icon: CheckCircle },
];

export default function CampaignBuilderPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { user } = useAuthStore();
  const isEdit   = Boolean(id);

  const [step,           setStep]           = useState(1);
  const [selectedFields, setSelectedFields] = useState<SelectedField[]>([]);
  const [fieldSearch,    setFieldSearch]    = useState('');

  const { register, handleSubmit, control, watch, reset, trigger, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      isActive: true, jornayaEnabled: false, trustedFormEnabled: false,
      destination: 'ringba_regular',
    },
  });

  const watchedDest   = watch('destination') as CampaignDestination;
  const watchedValues = watch();

  const needsRingba   = ['ringba_regular','ringba_regular_and_callgrid'].includes(watchedDest);
  const needsRtb      = ['ringba_rtb','ringba_rtb_and_callgrid'].includes(watchedDest);
  const needsCallGrid = ['callgrid','ringba_regular_and_callgrid','ringba_rtb_and_callgrid'].includes(watchedDest);

  const getStepFields = (s: number): (keyof FormData)[] => {
    if (s === 1) return user?.role === 'super_admin' ? ['name', 'publisher'] : ['name'];
    if (s === 2) return ['destination'];
    return [];
  };

  const handleNext = async () => {
    const fields = getStepFields(step);
    const valid  = fields.length === 0 ? true : await trigger(fields as any);
    if (valid) setStep((s) => s + 1);
  };

  // Load for edit
  const { data: existingCampaign } = useQuery({
    queryKey: ['campaign', id], queryFn: () => campaignService.getOne(id!), enabled: isEdit,
  });

  useEffect(() => {
    if (existingCampaign?.data?.data?.campaign) {
      const c = existingCampaign.data.data.campaign;
      reset({
        name:               c.name,
        publisher:          c.publisher ? (typeof c.publisher === 'object' ? c.publisher._id : c.publisher) : '',
        destination:        c.destination || 'ringba_regular',
        ringbaId:           c.ringbaId || '',
        ringbaRtbUrl:       c.ringbaRtbUrl || '',
        callgridUrl:        c.callgridUrl || '',
        isActive:           c.isActive,
        jornayaEnabled:     c.jornayaEnabled,
        trustedFormEnabled: c.trustedFormEnabled,
        description:        c.description || '',
      });
      setSelectedFields(
        c.fields
          .filter((cf: any) => cf.field != null)
          .map((cf: any, idx: number) => ({
            field:             cf.field,
            isRequired:        cf.isRequired,
            order:             cf.order ?? idx,
            includeInRingba:   cf.includeInRingba ?? true,
            destinationParams: cf.destinationParams || {},
          }))
      );
    }
  }, [existingCampaign, reset]);

  const { data: publishersData } = useQuery({
    queryKey: ['publishers-all'],
    queryFn:  () => publisherService.getAll({ limit: 100 }),
    enabled:  user?.role === 'super_admin',
  });
  const publishers: Publisher[] = publishersData?.data?.data || [];

  const { data: fieldsData } = useQuery({
    queryKey: ['fields-all', fieldSearch],
    queryFn:  () => fieldService.getAll({ limit: 200, search: fieldSearch }),
  });
  const allFields: Field[]  = fieldsData?.data?.data || [];
  const availableFields     = allFields.filter((f) => !selectedFields.find((sf) => sf.field._id === f._id));

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit ? campaignService.update(id!, payload) : campaignService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(isEdit ? 'Campaign updated.' : 'Campaign created.');
      navigate('/campaigns');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Save failed.'),
  });

  const addField = (field: Field) =>
    setSelectedFields((prev) => [
      ...prev,
      {
        field,
        isRequired: false,
        order: prev.length,
        includeInRingba: true,
        destinationParams: {
          ringba:   field.ringbaParamKey || field.key,
          rtb:      field.ringbaParamKey || field.key,
          callgrid: field.ringbaParamKey || field.key,
        },
      },
    ]);

  const removeField = (fieldId: string) =>
    setSelectedFields((prev) => prev.filter((sf) => sf.field._id !== fieldId));

  const updateField = (fieldId: string, key: keyof SelectedField, value: unknown) =>
    setSelectedFields((prev) =>
      prev.map((sf) => sf.field._id === fieldId ? { ...sf, [key]: value } : sf)
    );

  const updateDestParam = (fieldId: string, dest: keyof DestinationParams, value: string) =>
    setSelectedFields((prev) =>
      prev.map((sf) => sf.field._id === fieldId
        ? { ...sf, destinationParams: { ...sf.destinationParams, [dest]: value } }
        : sf
      )
    );

  const onSubmit = (data: FormData) => {
    saveMutation.mutate({
      ...data,
      fields: selectedFields.map((sf, idx) => ({
        field:             sf.field._id,
        isRequired:        sf.isRequired,
        order:             idx,
        includeInRingba:   sf.includeInRingba,
        destinationParams: sf.destinationParams,
      })),
    });
  };

  return (
    <div className="page-container max-w-4xl space-y-6">
      <div>
        <h1 className="section-title">{isEdit ? 'Edit Campaign' : 'New Campaign'}</h1>
        <p className="text-sm text-muted-foreground">Configure campaign destination and field API mapping</p>
      </div>

      {/* Step bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-1">
            <button type="button" onClick={() => step > s.id && setStep(s.id)}
              className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                step === s.id  ? 'bg-blue-600 text-white' :
                step > s.id    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 cursor-pointer' :
                                 'bg-slate-100 text-slate-400 cursor-not-allowed')}>
              {step > s.id ? <CheckCircle className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {idx < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* STEP 1 — Name + Publisher */}
        {step === 1 && (
          <Card>
            <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name *</Label>
                <Input placeholder="e.g. ACA CPL Q3" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              {user?.role === 'super_admin' ? (
                <div className="space-y-2">
                  <Label>Publisher *</Label>
                  <Controller name="publisher" control={control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <SelectTrigger><SelectValue placeholder="Select publisher..." /></SelectTrigger>
                      <SelectContent>
                        {publishers.map((p) => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                  {errors.publisher && <p className="text-xs text-destructive">{errors.publisher.message}</p>}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-muted text-sm">
                  Publisher: <strong>{user?.publisher?.name}</strong>
                </div>
              )}
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Optional" {...register('description')} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2 — Destination */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Lead Destination</CardTitle>
              <p className="text-sm text-muted-foreground">Paste the full example URL from your platform dashboard.</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Destination *</Label>
                <Controller name="destination" control={control} render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <SelectTrigger><SelectValue placeholder="Select destination..." /></SelectTrigger>
                    <SelectContent>
                      {DESTINATION_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>

              {/* Ringba Regular */}
              {needsRingba && (
                <div className="p-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 space-y-3">
                  <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Ringba Regular (Enrich)
                  </p>
                  <div className="space-y-1.5">
                    <Label>Ringba Enrich ID</Label>
                    <Input placeholder="e.g. 2633255861887173836" {...register('ringbaId')} className="font-mono" />
                    <p className="text-xs text-muted-foreground">
                      Ringba dashboard → Campaign → Enrich → ID
                    </p>
                  </div>
                  {watchedValues.ringbaId && (
                    <div className="rounded bg-blue-100/60 p-2.5 text-xs font-mono text-blue-700 break-all">
                      https://display.ringba.com/enrich/{watchedValues.ringbaId}
                    </div>
                  )}
                </div>
              )}

              {/* Ringba RTB */}
              {needsRtb && (
                <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50/40 space-y-3">
                  <p className="text-sm font-semibold text-purple-800 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Ringba RTB
                  </p>
                  <div className="space-y-1.5">
                    <Label>Paste full RTB example URL</Label>
                    <Input
                      placeholder="https://rtb.ringba.com/v1/production/32c482e...bcde.json?CID=5551234567&zip_code=90210"
                      {...register('ringbaRtbUrl')}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste the complete example URL including any sample params. Params in the URL become static defaults — 
                      field mappings (set in Step 3) override them.
                    </p>
                  </div>
                </div>
              )}

              {/* CallGrid */}
              {needsCallGrid && (
                <div className="p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/40 space-y-3">
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> CallGrid
                  </p>
                  <div className="space-y-1.5">
                    <Label>Paste full CallGrid example URL</Label>
                    <Input
                      placeholder="https://bid.callgrid.com/api/bid/cmp5yu7uu04qk07js2y9fbxkn?CallerId=5551234567&InboundStateCode=CA&InboundZipCode=90210"
                      {...register('callgridUrl')}
                      className="font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste the complete example URL. The campaign slug is extracted automatically.
                      Field param names are set per-field in Step 3.
                    </p>
                  </div>
                </div>
              )}

              {/* Internal enrich URL */}
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Internal Enrich URL</p>
                <code className="text-xs break-all text-primary">
                  {window.location.origin}/api/v1/public/enrich/
                  {watchedValues.publisher || '{publisherId}'}/{isEdit ? id : '{campaignId}'}
                </code>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 3 — Fields + per-destination param mapping */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Field picker */}
            <Card>
              <CardHeader>
                <CardTitle>Add Fields</CardTitle>
                <p className="text-sm text-muted-foreground">Click a field to add it. Then set the API param name per destination below.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Search fields..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {availableFields.map((field) => (
                    <button key={field._id} type="button" onClick={() => addField(field)}
                      className="flex items-start gap-2 p-3 rounded-lg border hover:border-blue-400 hover:bg-blue-50/40 transition-colors text-left group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{field.label}</p>
                        <p className="text-xs text-muted-foreground">{field.key} · {field.type}</p>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted group-hover:bg-blue-100 flex-shrink-0">{field.type}</span>
                    </button>
                  ))}
                  {availableFields.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 text-center py-4">All fields added or no matches.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Configured fields with per-destination param mapping */}
            {selectedFields.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Field → API Param Mapping ({selectedFields.length} fields)</CardTitle>
                  <div className="flex items-start gap-2 mt-1.5 text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500" />
                    <p>
                      Set the exact query param name each field sends to each platform.
                      Example: <code className="bg-muted px-0.5 rounded">phone</code> field →
                      Ringba: <code className="bg-muted px-0.5 rounded">callerid</code>,
                      RTB: <code className="bg-muted px-0.5 rounded">CID</code>,
                      CallGrid: <code className="bg-muted px-0.5 rounded">CallerId</code>
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedFields.map((sf) => (
                    <div key={sf.field._id} className="rounded-xl border bg-background overflow-hidden">
                      {/* Field header */}
                      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/70 border-b">
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold">{sf.field.label}</span>
                          <code className="text-xs text-muted-foreground ml-2">({sf.field.key})</code>
                          {sf.field.type === 'static_value' && (
                            <span className="ml-2 text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">static</span>
                          )}
                        </div>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={sf.isRequired}
                            onChange={(e) => updateField(sf.field._id, 'isRequired', e.target.checked)} className="rounded" />
                          Required
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={sf.includeInRingba}
                            onChange={(e) => updateField(sf.field._id, 'includeInRingba', e.target.checked)} className="rounded" />
                          Send to API
                        </label>
                        <button type="button" onClick={() => removeField(sf.field._id)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Per-destination param keys */}
                      {sf.includeInRingba && sf.field.type !== 'static_value' && (
                        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {needsRingba && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Ringba param
                              </p>
                              <Input
                                className="h-8 text-xs font-mono"
                                placeholder={sf.field.ringbaParamKey || sf.field.key}
                                value={sf.destinationParams.ringba || ''}
                                onChange={(e) => updateDestParam(sf.field._id, 'ringba', e.target.value)}
                              />
                            </div>
                          )}
                          {needsRtb && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-purple-500 inline-block" /> RTB param
                              </p>
                              <Input
                                className="h-8 text-xs font-mono"
                                placeholder={sf.field.ringbaParamKey || sf.field.key}
                                value={sf.destinationParams.rtb || ''}
                                onChange={(e) => updateDestParam(sf.field._id, 'rtb', e.target.value)}
                              />
                            </div>
                          )}
                          {needsCallGrid && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> CallGrid param
                              </p>
                              <Input
                                className="h-8 text-xs font-mono"
                                placeholder={sf.field.ringbaParamKey || sf.field.key}
                                value={sf.destinationParams.callgrid || ''}
                                onChange={(e) => updateDestParam(sf.field._id, 'callgrid', e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Static value preview */}
                      {sf.field.type === 'static_value' && (sf.field as any).staticValue && (
                        <div className="px-4 py-2 text-xs text-rose-600 bg-rose-50/50">
                          Always sends: <code className="bg-rose-100 px-1 rounded">{(sf.field as any).staticValue}</code>
                          {' '}as <code className="bg-rose-100 px-1 rounded">{sf.field.ringbaParamKey || sf.field.key}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* STEP 4 — Settings */}
        {step === 4 && (
          <Card>
            <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <ToggleRow label="Campaign Active" description="Inactive campaigns reject all submissions." name="isActive" control={control} />
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium">Compliance</p>
                <ToggleRow label="Jornaya" description="Require valid Jornaya LAC token." name="jornayaEnabled" control={control} />
                <ToggleRow label="TrustedForm" description="Require valid TrustedForm cert URL." name="trustedFormEnabled" control={control} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 5 — Review */}
        {step === 5 && (
          <Card>
            <CardHeader><CardTitle>Review &amp; Save</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ReviewRow label="Name"        value={watchedValues.name || '—'} />
              <ReviewRow label="Destination" value={DESTINATION_OPTIONS.find((d) => d.value === watchedValues.destination)?.label || '—'} />
              {needsRingba    && <ReviewRow label="Ringba ID"    value={watchedValues.ringbaId   || '—'} />}
              {needsRtb       && <ReviewRow label="RTB URL"      value={watchedValues.ringbaRtbUrl || '—'} />}
              {needsCallGrid  && <ReviewRow label="CallGrid URL" value={watchedValues.callgridUrl  || '—'} />}
              <ReviewRow label="Fields"      value={`${selectedFields.length} configured`} />
              <ReviewRow label="Active"      value={watchedValues.isActive ? 'Yes' : 'No'} />

              {selectedFields.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-sm font-medium">Field Mapping Summary</p>
                  {selectedFields.map((sf) => (
                    <div key={sf.field._id} className="text-xs p-2.5 rounded-lg bg-muted/50 border flex items-start justify-between gap-4">
                      <div>
                        <span className="font-medium">{sf.field.label}</span>
                        <code className="text-muted-foreground ml-1.5">({sf.field.key})</code>
                      </div>
                      <div className="flex gap-2 flex-wrap text-right">
                        {needsRingba   && sf.destinationParams.ringba   && <span className="text-blue-600">ringba:<code>{sf.destinationParams.ringba}</code></span>}
                        {needsRtb      && sf.destinationParams.rtb      && <span className="text-purple-600">rtb:<code>{sf.destinationParams.rtb}</code></span>}
                        {needsCallGrid && sf.destinationParams.callgrid && <span className="text-emerald-600">callgrid:<code>{sf.destinationParams.callgrid}</code></span>}
                        {sf.isRequired && <span className="text-orange-600 font-semibold">Required</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between pt-4">
          <Button type="button" variant="outline" onClick={() => step === 1 ? navigate('/campaigns') : setStep((s) => s - 1)}>
            <ChevronLeft className="h-4 w-4 mr-1" />{step === 1 ? 'Cancel' : 'Back'}
          </Button>
          {step < 5
            ? <Button type="button" onClick={handleNext}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
            : <Button type="submit" loading={saveMutation.isPending}>{isEdit ? 'Update Campaign' : 'Create Campaign'}</Button>
          }
        </div>
      </form>
    </div>
  );
}

function ToggleRow({ label, description, name, control }: { label: string; description: string; name: any; control: any }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground mt-0.5">{description}</p></div>
      <Controller name={name} control={control} render={({ field }) => (
        <button type="button" role="switch" aria-checked={field.value} onClick={() => field.onChange(!field.value)}
          className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
            field.value ? 'bg-blue-600' : 'bg-muted border border-input')}>
          <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            field.value ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      )} />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}