import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { fieldService } from '@/services';
import { Button } from '@/components/ui/button';
import { Input, Label, Card, CardContent } from '@/components/ui/index';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/index';
import { Plus, Search, Pencil, Trash2, Loader2, Layers, X, PlusCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Field } from '@/types';

// 'conditional' removed — any regular field can have conditional rules now
const FIELD_TYPES = [
  { value: 'text',              label: 'Text' },
  { value: 'email',             label: 'Email' },
  { value: 'phone',             label: 'Phone' },
  { value: 'number',            label: 'Number' },
  { value: 'select',            label: 'Select (dropdown)' },
  { value: 'radio',             label: 'Radio buttons' },
  { value: 'checkbox',          label: 'Checkbox' },
  { value: 'textarea',          label: 'Textarea' },
  { value: 'date',              label: 'Date' },
  { value: 'hidden',            label: 'Hidden' },
  { value: 'token_jornaya',     label: 'Jornaya Token' },
  { value: 'token_trustedform', label: 'TrustedForm Token' },
  { value: 'static_value',      label: 'Static Value (always sent to API)' },
];

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-800', email: 'bg-cyan-100 text-cyan-800',
  phone: 'bg-green-100 text-green-800', number: 'bg-orange-100 text-orange-800',
  select: 'bg-purple-100 text-purple-800', radio: 'bg-violet-100 text-violet-800',
  checkbox: 'bg-indigo-100 text-indigo-800', textarea: 'bg-sky-100 text-sky-800',
  date: 'bg-teal-100 text-teal-800', hidden: 'bg-gray-100 text-gray-600',
  token_jornaya: 'bg-amber-100 text-amber-800', token_trustedform: 'bg-yellow-100 text-yellow-800',
  static_value: 'bg-rose-100 text-rose-800',
};

const OPERATORS = [
  { value: 'eq',       label: '= equals' },
  { value: 'neq',      label: '≠ not equals' },
  { value: 'gt',       label: '> greater than' },
  { value: 'gte',      label: '≥ greater or equal' },
  { value: 'lt',       label: '< less than' },
  { value: 'lte',      label: '≤ less or equal' },
  { value: 'contains', label: '~ contains' },
  { value: 'exists',   label: '✓ is not empty' },
];

const conditionalRuleSchema = z.object({
  sourceFieldKey: z.string().optional(),
  operator:       z.string().min(1),
  value:          z.string().optional(),
  action:         z.enum(['show','hide','require']),
  targetFieldKey: z.string().min(1, 'Target field key required'),
});

const schema = z.object({
  label:          z.string().min(1, 'Label required'),
  key:            z.string().min(1).regex(/^[a-z0-9_]+$/, 'Lowercase, numbers, underscores only'),
  type:           z.string().min(1, 'Type required'),
  placeholder:    z.string().optional(),
  description:    z.string().optional(),
  ringbaParamKey: z.string().optional(),
  staticValue:    z.string().optional(),
  defaultValue:   z.string().optional(),
  options:        z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
  conditionalRules: z.array(conditionalRuleSchema).optional(),
  validation: z.object({
    min: z.string().optional(), max: z.string().optional(),
    minLength: z.string().optional(), maxLength: z.string().optional(),
    pattern: z.string().optional(),
  }).optional(),
});

type FormData = z.infer<typeof schema>;

export default function FieldLibraryPage() {
  const qc = useQueryClient();
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [page,         setPage]         = useState(1);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [showGuide,    setShowGuide]    = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['fields', { search, typeFilter, page }],
    queryFn:  () => fieldService.getAll({ search, type: typeFilter || undefined, page, limit: 30 }),
  });

  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({ control, name: 'options' });
  const { fields: ruleFields,   append: appendRule,   remove: removeRule   } = useFieldArray({ control, name: 'conditionalRules' });

  const watchedType = watch('type');
  const watchedKey  = watch('key');

  const hasOptions    = ['select','radio','checkbox'].includes(watchedType);
  const hasStatic     = watchedType === 'static_value';
  const hasValidation = ['text','email','phone','number','textarea'].includes(watchedType);
  const canHaveRules  = !['token_jornaya','token_trustedform','static_value','hidden'].includes(watchedType) && Boolean(watchedType);

  const saveMutation = useMutation({
    mutationFn: (d: FormData) => {
      const payload: any = { ...d };
      if (payload.validation) {
        const v = payload.validation;
        payload.validation = {
          min:       v.min       ? Number(v.min)       : undefined,
          max:       v.max       ? Number(v.max)       : undefined,
          minLength: v.minLength ? Number(v.minLength) : undefined,
          maxLength: v.maxLength ? Number(v.maxLength) : undefined,
          pattern:   v.pattern || undefined,
        };
      }
      if (payload.conditionalRules) {
        payload.conditionalRules = payload.conditionalRules.map((r: any) => ({
          ...r,
          sourceFieldKey: r.sourceFieldKey?.trim() || null,
        }));
      }
      return editingField
        ? fieldService.update(editingField._id, payload)
        : fieldService.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fields'] });
      toast.success(editingField ? 'Field updated.' : 'Field created.');
      closeModal();
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Save failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fieldService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fields'] }); toast.success('Field deleted.'); },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Delete failed.'),
  });

  const allFields: Field[] = data?.data?.data || [];
  const meta               = data?.data?.meta;

  const openModal = (field?: Field) => {
    setEditingField(field || null);
    reset(field ? {
      label:          field.label,
      key:            field.key,
      type:           field.type,
      placeholder:    field.placeholder    || '',
      description:    field.description    || '',
      ringbaParamKey: field.ringbaParamKey || '',
      staticValue:    (field as any).staticValue || '',
      defaultValue:   field.defaultValue != null ? String(field.defaultValue) : '',
      options:        (field.options || []).map((o) => ({ label: o.label, value: o.value })),
      conditionalRules: ((field as any).conditionalRules || []).map((r: any) => ({
        sourceFieldKey: r.sourceFieldKey || '',
        operator:       r.operator,
        value:          r.value != null ? String(r.value) : '',
        action:         r.action,
        targetFieldKey: r.targetFieldKey,
      })),
      validation: {
        min:       field.validation?.min       != null ? String(field.validation.min)       : '',
        max:       field.validation?.max       != null ? String(field.validation.max)       : '',
        minLength: field.validation?.minLength != null ? String(field.validation.minLength) : '',
        maxLength: field.validation?.maxLength != null ? String(field.validation.maxLength) : '',
        pattern:   field.validation?.pattern   || '',
      },
    } : {
      label: '', key: '', type: '', placeholder: '', description: '',
      ringbaParamKey: '', staticValue: '', defaultValue: '', options: [],
      conditionalRules: [],
      validation: { min: '', max: '', minLength: '', maxLength: '', pattern: '' },
    });
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingField(null); reset(); };

  return (
    <div className="page-container space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">Field Library</h1>
          <p className="text-sm text-muted-foreground">{meta?.total ?? '—'} global fields</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGuide((v) => !v)}>
            <Info className="h-4 w-4 mr-1.5" />
            How to setup conditional fields
            {showGuide ? <ChevronUp className="h-3.5 w-3.5 ml-1.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-1.5" />}
          </Button>
          <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />New Field</Button>
        </div>
      </div>

      {/* How-to guide */}
      {showGuide && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold text-blue-800">Example: Income → show QLE dropdown when income &gt; 20,000</p>
            <ol className="space-y-2 text-sm text-blue-700 list-decimal list-inside">
              <li>
                Create field <strong>Income</strong> — type: <code className="bg-blue-100 px-1 rounded">number</code>,
                key: <code className="bg-blue-100 px-1 rounded">income</code>,
                API Param: <code className="bg-blue-100 px-1 rounded">income</code>.
                Then add a <strong>Conditional Rule</strong>: <em>Watch field = income, Condition = greater than, Value = 20000, Then = Show field, Target = qle</em>
              </li>
              <li>
                Create field <strong>QLE Eligible</strong> — type: <code className="bg-blue-100 px-1 rounded">select</code>,
                key: <code className="bg-blue-100 px-1 rounded">qle</code>.
                Add options: Yes / No.
              </li>
              <li>Add both fields to your campaign. QLE will be hidden by default and appear when income &gt; 20,000.</li>
            </ol>
            <p className="text-xs text-blue-600">
              ⚠️ The Income field type must be <strong>number</strong> (not "conditional") — "conditional" was a bug that showed only a label.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search fields..." className="pl-9" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : allFields.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Layers className="h-8 w-8 mb-2 opacity-30" /><p className="text-sm">No fields found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allFields.map((field) => (
            <Card key={field._id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{field.label}</p>
                    <code className="text-xs text-muted-foreground">{field.key}</code>
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium ml-2 flex-shrink-0', TYPE_COLORS[field.type] || 'bg-gray-100 text-gray-700')}>
                    {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type}
                  </span>
                </div>

                {field.ringbaParamKey && (
                  <p className="text-xs text-muted-foreground">
                    API param: <code className="bg-muted px-1 rounded font-mono">{field.ringbaParamKey}</code>
                  </p>
                )}
                {(field as any).staticValue && (
                  <p className="text-xs text-rose-600 mt-0.5">
                    Always: <code className="bg-rose-50 px-1 rounded">{(field as any).staticValue}</code>
                  </p>
                )}
                {(field.options?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">{field.options!.length} options</p>
                )}
                {((field as any).conditionalRules?.length ?? 0) > 0 && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    {(field as any).conditionalRules.length} conditional rule{(field as any).conditionalRules.length !== 1 ? 's' : ''}
                  </p>
                )}

                <div className="flex gap-1 mt-3 pt-3 border-t">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openModal(field)}>
                    <Pencil className="h-3 w-3 mr-1" />Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={deleteMutation.isPending}
                    onClick={() => confirm(`Delete "${field.label}"?`) && deleteMutation.mutate(field._id)}>
                    <Trash2 className="h-3 w-3 mr-1" />Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {meta && meta.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.pages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <Card className="w-full max-w-2xl my-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-base">{editingField ? 'Edit Field' : 'New Field'}</h2>
                <button onClick={closeModal}><X className="h-4 w-4" /></button>
              </div>

              <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-5">

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Label *</Label>
                    <Input placeholder="e.g. Annual Income" {...register('label')} />
                    {errors.label && <p className="text-xs text-destructive">{errors.label.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Key * <span className="text-xs text-muted-foreground">(snake_case)</span></Label>
                    <Input placeholder="e.g. annual_income" {...register('key')} disabled={Boolean(editingField)} />
                    {errors.key && <p className="text-xs text-destructive">{errors.key.message}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Field Type *</Label>
                  <Controller name="type" control={control} render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                  {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Default API Param Name</Label>
                    <Input placeholder="e.g. callerid, CID, CallerId" {...register('ringbaParamKey')} className="font-mono text-sm" />
                    <p className="text-xs text-muted-foreground">
                      Override in Campaign Builder per destination.<br/>
                      Leave blank = uses field key.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Placeholder</Label>
                    <Input placeholder="e.g. Enter amount..." {...register('placeholder')} />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input placeholder="Internal notes..." {...register('description')} />
                </div>

                {/* Static value */}
                {hasStatic && (
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                    <Label>Static Value *</Label>
                    <Input placeholder="e.g. yes" {...register('staticValue')} />
                    <p className="text-xs text-rose-700">
                      This exact value is always sent to the API. Set <em>API Param Name</em> to the param key
                      (e.g. <code>exposeCallerId</code>) and this to the value (e.g. <code>yes</code>).
                    </p>
                  </div>
                )}

                {/* Options */}
                {hasOptions && (
                  <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Options</Label>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => appendOption({ label: '', value: '' })}>
                        <PlusCircle className="h-3.5 w-3.5 mr-1" />Add option
                      </Button>
                    </div>
                    {optionFields.length === 0 && <p className="text-xs text-muted-foreground">No options yet.</p>}
                    {optionFields.map((o, idx) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <Input placeholder="Label (shown to user)" className="flex-1" {...register(`options.${idx}.label`)} />
                        <Input placeholder="Value (sent to API)"   className="flex-1 font-mono text-sm" {...register(`options.${idx}.value`)} />
                        <button type="button" onClick={() => removeOption(idx)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Conditional rules */}
                {canHaveRules && (
                  <div className="p-4 rounded-lg border bg-blue-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Conditional Rules <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Show/hide another field based on this field's value.
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => appendRule({ sourceFieldKey: '', operator: 'gt', value: '', action: 'show', targetFieldKey: '' })}>
                        <PlusCircle className="h-3.5 w-3.5 mr-1" />Add rule
                      </Button>
                    </div>

                    {ruleFields.map((rf, idx) => (
                      <div key={rf.id} className="p-3 rounded-lg border bg-white space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-muted-foreground">Rule {idx + 1}</p>
                          <button type="button" onClick={() => removeRule(idx)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Watch field
                              <span className="text-muted-foreground font-normal ml-1">
                                (blank = <code className="bg-muted px-0.5 rounded text-xs">{watchedKey || 'this field'}</code>)
                              </span>
                            </p>
                            <Input className="h-8 text-xs font-mono" placeholder={watchedKey || 'field_key'}
                              {...register(`conditionalRules.${idx}.sourceFieldKey`)} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Condition</p>
                            <Controller name={`conditionalRules.${idx}.operator`} control={control} render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value || ''}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Operator" /></SelectTrigger>
                                <SelectContent>{OPERATORS.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                              </Select>
                            )} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Compare value</p>
                            <Input className="h-8 text-xs" placeholder="e.g. 20000"
                              {...register(`conditionalRules.${idx}.value`)} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Then</p>
                            <Controller name={`conditionalRules.${idx}.action`} control={control} render={({ field }) => (
                              <Select onValueChange={field.onChange} value={field.value || ''}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="show">Show field</SelectItem>
                                  <SelectItem value="hide">Hide field</SelectItem>
                                  <SelectItem value="require">Make required</SelectItem>
                                </SelectContent>
                              </Select>
                            )} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium">Target field key</p>
                            <Input className="h-8 text-xs font-mono" placeholder="e.g. qle"
                              {...register(`conditionalRules.${idx}.targetFieldKey`)} />
                            {(errors.conditionalRules as any)?.[idx]?.targetFieldKey &&
                              <p className="text-xs text-destructive">{(errors.conditionalRules as any)[idx].targetFieldKey.message}</p>}
                          </div>
                        </div>

                        {/* Live preview */}
                        <div className="flex items-center gap-1.5 bg-blue-50 rounded px-2.5 py-1.5 text-xs text-blue-700">
                          <Info className="h-3 w-3 flex-shrink-0" />
                          When <code className="bg-blue-100 px-0.5 rounded">{watch(`conditionalRules.${idx}.sourceFieldKey` as any) || watchedKey || '?'}</code>
                          {' '}{OPERATORS.find(o => o.value === watch(`conditionalRules.${idx}.operator` as any))?.label || '?'}{' '}
                          <code className="bg-blue-100 px-0.5 rounded">{watch(`conditionalRules.${idx}.value` as any) || '?'}</code>
                          {' '}→ <strong>{watch(`conditionalRules.${idx}.action` as any) || '?'}</strong>{' '}
                          <code className="bg-blue-100 px-0.5 rounded">{watch(`conditionalRules.${idx}.targetFieldKey` as any) || '?'}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Validation */}
                {hasValidation && (
                  <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                    <Label>Validation <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <div className="grid grid-cols-2 gap-3">
                      {['text','email','phone','textarea'].includes(watchedType) && (
                        <>
                          <div className="space-y-1"><p className="text-xs text-muted-foreground">Min length</p>
                            <Input type="number" className="h-8" {...register('validation.minLength')} /></div>
                          <div className="space-y-1"><p className="text-xs text-muted-foreground">Max length</p>
                            <Input type="number" className="h-8" {...register('validation.maxLength')} /></div>
                        </>
                      )}
                      {watchedType === 'number' && (
                        <>
                          <div className="space-y-1"><p className="text-xs text-muted-foreground">Min value</p>
                            <Input type="number" className="h-8" {...register('validation.min')} /></div>
                          <div className="space-y-1"><p className="text-xs text-muted-foreground">Max value</p>
                            <Input type="number" className="h-8" {...register('validation.max')} /></div>
                        </>
                      )}
                      <div className="col-span-2 space-y-1"><p className="text-xs text-muted-foreground">Regex pattern</p>
                        <Input placeholder="e.g. ^\d{5}$" className="h-8 font-mono text-xs" {...register('validation.pattern')} /></div>
                    </div>
                  </div>
                )}

                {/* Default value */}
                {!hasStatic && !['token_jornaya','token_trustedform'].includes(watchedType) && watchedType && (
                  <div className="space-y-1.5">
                    <Label>Default Value <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                    <Input placeholder="Pre-filled value" {...register('defaultValue')} />
                  </div>
                )}

                <div className="flex gap-3 pt-2 border-t">
                  <Button type="button" variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                  <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
                    {editingField ? 'Update Field' : 'Create Field'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
