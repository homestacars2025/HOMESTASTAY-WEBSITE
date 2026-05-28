import { Check, X, Clock } from 'lucide-react';
import type { UnitRules } from '@/lib/types/unit';

interface RuleItem {
  field: keyof Pick<
    UnitRules,
    | 'allow_parties'
    | 'allow_pets'
    | 'allow_smoking'
    | 'allow_unregistered_guests'
  >;
  labelKey: 'allow_parties' | 'allow_pets' | 'allow_smoking' | 'allow_unregistered_guests';
}

interface SuitabilityItem {
  field: keyof Pick<UnitRules, 'family_friendly' | 'id_required'>;
  labelKey: 'family_friendly' | 'id_required';
}

const PERMISSION_RULES: RuleItem[] = [
  { field: 'allow_parties',             labelKey: 'allow_parties' },
  { field: 'allow_pets',                labelKey: 'allow_pets' },
  { field: 'allow_smoking',             labelKey: 'allow_smoking' },
  { field: 'allow_unregistered_guests', labelKey: 'allow_unregistered_guests' },
];

const SUITABILITY_RULES: SuitabilityItem[] = [
  { field: 'family_friendly', labelKey: 'family_friendly' },
  { field: 'id_required',     labelKey: 'id_required' },
];

interface UnitRulesSectionProps {
  rules: UnitRules;
  labels: {
    rulesTitle: string;
    allow_parties: string;
    allow_pets: string;
    allow_smoking: string;
    allow_unregistered_guests: string;
    family_friendly: string;
    id_required: string;
    quiet_hours: string;
    additional_rules: string;
    allowed: string;
    not_allowed: string;
    yes: string;
    no: string;
  };
}

function AllowedIndicator({ allowed, labels }: { allowed: boolean; labels: { allowed: string; not_allowed: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${allowed ? 'text-ink-soft' : 'text-mute'}`}>
      {allowed
        ? <Check className="w-3.5 h-3.5 text-[#3A9D6E] shrink-0" />
        : <X className="w-3.5 h-3.5 text-mute shrink-0" />
      }
      {allowed ? labels.allowed : labels.not_allowed}
    </span>
  );
}

function YesNoIndicator({ value, labels }: { value: boolean; labels: { yes: string; no: string } }) {
  return (
    <span className={`text-[13px] font-medium ${value ? 'text-ink-soft' : 'text-mute'}`}>
      {value ? labels.yes : labels.no}
    </span>
  );
}

export function UnitRulesSection({ rules, labels }: UnitRulesSectionProps) {
  return (
    <section>
      <h2 className="text-base font-medium text-ink mb-5 tracking-[-0.015em]">
        {labels.rulesTitle}
      </h2>

      <div className="space-y-5">
        {/* Permissions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          {PERMISSION_RULES.map(({ field, labelKey }) => (
            <div key={field} className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-soft">{labels[labelKey]}</span>
              <AllowedIndicator
                allowed={rules[field]}
                labels={{ allowed: labels.allowed, not_allowed: labels.not_allowed }}
              />
            </div>
          ))}
          {SUITABILITY_RULES.map(({ field, labelKey }) => (
            <div key={field} className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink-soft">{labels[labelKey]}</span>
              <YesNoIndicator
                value={rules[field]}
                labels={{ yes: labels.yes, no: labels.no }}
              />
            </div>
          ))}
        </div>

        {/* Quiet hours */}
        {rules.quiet_hours_enabled && rules.quiet_hours_from && rules.quiet_hours_to && (
          <div className="flex items-center gap-2.5 text-sm text-ink-soft">
            <Clock className="w-[18px] h-[18px] text-mute shrink-0" />
            <span className="text-mute">{labels.quiet_hours}</span>
            <span className="ms-auto font-medium tabular-nums">
              {rules.quiet_hours_from} – {rules.quiet_hours_to}
            </span>
          </div>
        )}

        {/* Additional rules text */}
        {rules.additional_rules && (
          <div className="pt-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute mb-2">
              {labels.additional_rules}
            </p>
            <p className="text-sm text-ink-soft leading-relaxed">
              {rules.additional_rules}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
