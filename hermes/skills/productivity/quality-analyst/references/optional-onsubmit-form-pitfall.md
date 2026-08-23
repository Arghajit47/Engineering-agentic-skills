# Optional `onSubmit` Form Component Pitfall

Session-proven pattern from KAN-34 QA.

## The trap

A reusable form component exposes an optional `onSubmit` prop. When the prop is omitted, the component still validates inputs, shows a loading state, and renders a "Thank You" success UI — but it never makes a network request. The success UI alone looks like the integration works.

Example (React):
```tsx
export function PropertyInquiryForm({ propertySlug, propertyTitle, onSubmit }: Props) {
  // ... validation ...
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (onSubmit) {
      await onSubmit({ ...formData, propertySlug });
    }
    setIsSubmitted(true); // success UI even if no request happened
  };
}
```

## How to detect it

Integration QA must verify the actual POST, not just the success state:

1. **Unit/integration test:** mock `global.fetch` and assert it was called with the correct URL, method, headers, and body.
2. **Playwright e2e:** attach a response listener and assert the POST returned the expected status.
3. **DB assertion:** for write endpoints, query the actual database for the inserted row.

## What developers should do

When wiring a reusable form into a page, always pass an `onSubmit` handler that performs the real API call:

```tsx
const handleInquirySubmit = async (formData: PropertyInquiryFormData & { propertySlug: string }) => {
  const res = await fetch("/api/contact/property", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || "Submission failed");
  }
};

<PropertyInquiryForm propertySlug={data.slug} propertyTitle={data.title} onSubmit={handleInquirySubmit} />
```

## What QA should do

Add a test case like:
```
TC-XXX|Form submit posts to correct API endpoint|Network request to /api/... observed with 20x status; DB row created|Critical
```

If the success UI appears but no request was made, mark it **FAIL Critical** and transition the ticket back to In Progress.
