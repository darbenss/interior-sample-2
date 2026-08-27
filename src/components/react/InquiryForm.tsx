import { useMemo, useRef, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import MotionRoot from './MotionRoot';
import { trackCta } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/whatsapp';

/* ---------------------------------------------------------------------------
 * Inquiry form — composes a WhatsApp message rather than POSTing anywhere.
 *
 * WHY THERE IS NO BACKEND HERE
 * A conventional contact form needs a request-time endpoint, which would be the
 * one genuinely attackable surface on an otherwise fully static site: spam,
 * injection, and an inbox nobody checks. Instead the fields are assembled into
 * a pre-filled WhatsApp message on the client. The visitor lands in a thread
 * with their brief already written, the studio replies where it actually reads
 * messages, and the site keeps zero server-side input handling.
 *
 * It also converts better in this market: WhatsApp is where Indonesian clients
 * already are, and a reply costs them one tap rather than an email round trip.
 *
 * A mailto fallback is offered for anyone who prefers email. If the studio ever
 * does want a stored inbox, README §2 covers wiring the same payload to a
 * Pages Function — the form does not change.
 * ------------------------------------------------------------------------- */

export type InquiryFormProps = {
  number: string;
  email: string;
};

const projectTypes = [
  'Residential Architecture',
  'Commercial Space',
  'Interior Design Only',
  'Consultation',
];

type Field = {
  id: keyof FormState;
  label: string;
  type?: string;
  multiline?: boolean;
  required?: boolean;
};

type FormState = {
  name: string;
  email: string;
  projectType: string;
  message: string;
};

const fields: Field[] = [
  { id: 'name', label: 'Name', required: true },
  { id: 'email', label: 'Email', type: 'email', required: true },
  { id: 'message', label: 'Tell us about the space', multiline: true, required: true },
];

export default function InquiryForm({ number, email }: InquiryFormProps) {
  const [values, setValues] = useState<FormState>({
    name: '',
    email: '',
    projectType: projectTypes[0],
    message: '',
  });
  const [touched, setTouched] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const reduceMotion = useReducedMotion();

  const complete =
    values.name.trim() !== '' &&
    values.email.trim() !== '' &&
    values.message.trim() !== '';

  const body = useMemo(
    () =>
      [
        `Name: ${values.name || '—'}`,
        `Email: ${values.email || '—'}`,
        `Project type: ${values.projectType}`,
        '',
        values.message,
      ].join('\n'),
    [values]
  );

  const waHref = buildWhatsAppUrl({
    number,
    message: 'Hello Ruang Rasa, I would like to discuss a project.',
    context: body,
  });

  const mailHref = `mailto:${email}?subject=${encodeURIComponent(
    `Project inquiry — ${values.projectType}`
  )}&body=${encodeURIComponent(body)}`;

  const set = (id: keyof FormState) => (value: string) =>
    setValues((prev) => ({ ...prev, [id]: value }));

  return (
    <MotionRoot>
    <form
      className="space-y-12"
      onSubmit={(event) => {
        // Enter-to-submit routes to the same place the button does.
        event.preventDefault();
        setTouched(true);
        if (complete) linkRef.current?.click();
      }}
    >
      {fields.map((field) => (
        <FloatingField
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={set(field.id)}
          invalid={touched && field.required === true && values[field.id].trim() === ''}
        />
      ))}

      <fieldset>
        <legend className="font-body text-label-caps uppercase tracking-[0.15em] text-on-surface-variant">
          Project Type
        </legend>
        <div className="mt-6 flex flex-wrap gap-3">
          {projectTypes.map((type) => {
            const active = values.projectType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => set('projectType')(type)}
                aria-pressed={active}
                className={`border px-5 py-3 font-body text-label-caps uppercase tracking-[0.15em] transition-colors duration-500 ${
                  active
                    ? 'border-charcoal bg-charcoal text-surface'
                    : 'border-outline-variant text-on-surface-variant hover:border-charcoal hover:text-charcoal'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </fieldset>

      {touched && !complete && (
        <p role="alert" className="font-body text-body-md text-[#ba1a1a]">
          Please add your name, email and a short description before sending.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <m.a
          ref={linkRef}
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-cta="inquiry-form-whatsapp"
          data-cta-location="inquiries"
          data-cta-label="Inquiry form submit"
          onClick={(event) => {
            if (!complete) {
              // The one place we DO block navigation: an empty brief helps
              // nobody. Everything else proceeds untouched.
              event.preventDefault();
              setTouched(true);
              return;
            }
            if (linkRef.current) trackCta(linkRef.current, event.nativeEvent);
          }}
          aria-disabled={!complete}
          className={`group relative inline-flex items-center gap-3 overflow-hidden px-8 py-4 font-body text-label-caps uppercase tracking-[0.15em] no-underline transition-colors duration-500 ${
            complete
              ? 'bg-charcoal text-surface'
              : 'bg-charcoal/40 text-surface/70'
          }`}
          whileHover={reduceMotion || !complete ? undefined : 'hover'}
          whileTap={reduceMotion || !complete ? undefined : { scale: 0.985 }}
          initial="rest"
          animate="rest"
        >
          {!reduceMotion && complete && (
            <m.span
              aria-hidden="true"
              className="absolute inset-0 bg-brass"
              style={{ originY: 1 }}
              variants={{ rest: { scaleY: 0 }, hover: { scaleY: 1 } }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          <span className="relative z-10">Send via WhatsApp</span>
        </m.a>

        <a
          href={mailHref}
          data-cta="inquiry-form-email"
          data-cta-location="inquiries"
          data-cta-label="Inquiry form email fallback"
          className="font-body text-label-caps uppercase tracking-[0.15em] text-on-surface-variant no-underline underline-offset-4 transition-colors hover:text-brass-deep"
        >
          Or send by email
        </a>
      </div>
    </form>
    </MotionRoot>
  );
}

/* DESIGN.md, Form Fields: "Use Floating Labels. The input is a single 1px
   Charcoal line at the bottom. The label is Montserrat, which shrinks and moves
   up when the field is active. No background fill for inputs." */
function FloatingField({
  field,
  value,
  onChange,
  invalid,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value !== '';
  const id = `field-${field.id}`;

  const shared = {
    id,
    value,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    'aria-invalid': invalid,
    required: field.required,
    className:
      'w-full rounded-none border-0 border-b bg-transparent px-0 pb-3 pt-8 font-body text-body-lg text-on-surface outline-none transition-colors ' +
      (invalid ? 'border-[#ba1a1a]' : 'border-charcoal focus:border-brass'),
  };

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-0 origin-left font-body text-on-surface-variant transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          floated
            ? 'top-0 text-label-caps uppercase tracking-[0.15em]'
            : 'top-7 text-body-lg'
        }`}
      >
        {field.label}
      </label>

      {field.multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} type={field.type ?? 'text'} />
      )}
    </div>
  );
}
