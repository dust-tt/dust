---
name: react-hook-form-writer
description: Write and refactor React forms using react-hook-form with Zod validation. Use when creating new form components, converting existing forms to react-hook-form, or implementing form validation patterns.
---

# React Hook Form Writer

This skill helps you write new forms and refactor existing forms to use react-hook-form following project best practices.

## When to Use

- Creating new form components from scratch
- Converting existing forms to react-hook-form
- Adding validation to forms
- Implementing complex form patterns (nested forms, field arrays, multi-step)

## Core Principles

### 1. Always Use Zod for Validation

Define schemas with Zod and integrate via `zodResolver`:

```typescript
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  age: z.number().min(18, "Must be at least 18"),
});

type FormValues = z.infer<typeof formSchema>;

const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    name: "",
    email: "",
    age: 18,
  },
});
```

### 2. Prefer useController Over Controller

Use `useController` hook for better composability in custom field components:

```typescript
// Good: useController
function TextField({ name, control, label }: TextFieldProps) {
  const { field, fieldState } = useController({ name, control });

  return (
    <div>
      <label>{label}</label>
      <input {...field} />
      {fieldState.error && <span>{fieldState.error.message}</span>}
    </div>
  );
}

// Avoid: Controller component (less composable)
<Controller
  name="name"
  control={control}
  render={({ field }) => <input {...field} />}
/>
```

### 3. Uncontrolled by Default

Leverage react-hook-form's uncontrolled approach for native inputs:

```typescript
// Good: Uncontrolled with register
<input {...register("name")} />

// Only use Controller/useController for third-party controlled components
// (e.g., shadcn Select, custom date pickers, rich text editors)
```

### 4. Use field.onChange for User Interactions, setValue for Programmatic Updates

When working with `useController`, use `field.onChange` for user interactions:

```typescript
// Good: field.onChange for user interactions
const { field } = useController({ name: "status", control });

<Select onValueChange={field.onChange} value={field.value}>
  {options.map((opt) => (
    <SelectItem key={opt.value} value={opt.value}>
      {opt.label}
    </SelectItem>
  ))}
</Select>

// Bad: setValue for user interactions (breaks controller lifecycle)
<Select onValueChange={(v) => setValue("status", v)} value={watch("status")}>
```

Use `setValue` (from `useFormContext`) for programmatic updates in effects:

```typescript
// Good: setValue for programmatic initialization
const { setValue } = useFormContext();
const { field } = useController({ name: "status" });

useEffect(() => {
  if (externalData) {
    setValue("status", externalData.defaultStatus); // ✓ programmatic
  }
}, [externalData, setValue]);

const handleUserSelect = (value: string) => {
  field.onChange(value); // ✓ user interaction
};
```

**CRITICAL: Never use field.onChange inside useEffect dependencies**

`useController` returns new field objects on every render. Including them in `useEffect` dependencies while also calling `field.onChange()` inside the effect causes infinite loops:

```typescript
// BAD: Infinite loop - field objects change every render
const { field } = useController({ name: "status" });

useEffect(() => {
  field.onChange(defaultValue); // Triggers re-render
}, [field, defaultValue]); // field changes → effect runs → onChange → re-render → repeat

// GOOD: Use setValue (stable) for programmatic updates in effects
const { setValue } = useFormContext();
const { field } = useController({ name: "status" });

useEffect(() => {
  setValue("status", defaultValue); // setValue is stable
}, [defaultValue, setValue]);

// User interactions still use field.onChange
const handleSelect = (value: string) => {
  field.onChange(value);
};
```

**Summary:**
- `field.onChange` → user interaction handlers (onClick, onSelect, etc.)
- `setValue` → programmatic updates in useEffect or callbacks based on external data

### 5. Always Provide Default Values

Always provide `defaultValues` in `useForm` for all fields:

```typescript
// Good: All fields have defaults
const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    name: "",
    email: "",
    items: [],
    settings: {
      notifications: true,
      theme: "light",
    },
  },
});

// Bad: Missing defaultValues causes controlled/uncontrolled warnings
const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
});
```

### 6. Watch Specific Fields Only

Never use `watch()` without parameters:

```typescript
// Good: Watch specific fields
const selectedType = watch("type");
const [name, email] = watch(["name", "email"]);

// Bad: Watches everything, causes unnecessary re-renders
const allValues = watch();
```

### 7. Use Dot Notation for Nested Fields

```typescript
const schema = z.object({
  user: z.object({
    profile: z.object({
      firstName: z.string(),
      lastName: z.string(),
    }),
  }),
});

// Access nested fields with dot notation
<input {...register("user.profile.firstName")} />
```

### 8. Use useFieldArray for Dynamic Lists

```typescript
const { fields, append, remove } = useFieldArray({
  control,
  name: "items",
});

return (
  <div>
    {fields.map((field, index) => (
      <div key={field.id}>
        <input {...register(`items.${index}.name`)} />
        <button type="button" onClick={() => remove(index)}>
          Remove
        </button>
      </div>
    ))}
    <button type="button" onClick={() => append({ name: "" })}>
      Add Item
    </button>
  </div>
);
```

### 9. Proper Form Submission

```typescript
const onSubmit = async (data: FormValues) => {
  try {
    await submitToApi(data);
  } catch (error) {
    // Handle API errors, optionally set form errors
    form.setError("root", { message: "Submission failed" });
  }
};

<form onSubmit={form.handleSubmit(onSubmit)}>
  {/* fields */}
  {form.formState.errors.root && (
    <div className="error">{form.formState.errors.root.message}</div>
  )}
  <button type="submit" disabled={form.formState.isSubmitting}>
    Submit
  </button>
</form>
```

### 10. Reset Forms Correctly

```typescript
// Good: Reset with new values
form.reset({
  name: "New Name",
  email: "new@email.com",
});

// Good: Reset to default values
form.reset();

// Bad: Manual field clearing
setValue("name", "");
setValue("email", "");
```

### 11. Sub-form Validation with trigger()

```typescript
// Validate specific fields (useful for multi-step forms)
const isStepValid = await form.trigger(["name", "email"]);

if (isStepValid) {
  goToNextStep();
}
```

### 12. Error Display Pattern

```typescript
// Access errors via formState.errors
const {
  formState: { errors },
} = form;

<div>
  <input {...register("email")} />
  {errors.email && (
    <span className="text-red-500">{errors.email.message}</span>
  )}
</div>
```

## Complete Example

```typescript
import { useForm, useController, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "user", "guest"]),
  tags: z.array(z.object({ value: z.string().min(1) })),
});

type FormValues = z.infer<typeof schema>;

function MyForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      role: "user",
      tags: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tags",
  });

  const onSubmit = async (data: FormValues) => {
    console.log(data);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label>Name</label>
        <input {...form.register("name")} />
        {form.formState.errors.name && (
          <span>{form.formState.errors.name.message}</span>
        )}
      </div>

      <div>
        <label>Email</label>
        <input {...form.register("email")} />
        {form.formState.errors.email && (
          <span>{form.formState.errors.email.message}</span>
        )}
      </div>

      <RoleSelect control={form.control} />

      <div>
        <label>Tags</label>
        {fields.map((field, index) => (
          <div key={field.id}>
            <input {...form.register(`tags.${index}.value`)} />
            <button type="button" onClick={() => remove(index)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={() => append({ value: "" })}>
          Add Tag
        </button>
      </div>

      <button type="submit" disabled={form.formState.isSubmitting}>
        Submit
      </button>
    </form>
  );
}

// Custom controlled component using useController
function RoleSelect({ control }: { control: Control<FormValues> }) {
  const { field, fieldState } = useController({
    name: "role",
    control,
  });

  return (
    <div>
      <label>Role</label>
      <select onChange={field.onChange} value={field.value} ref={field.ref}>
        <option value="admin">Admin</option>
        <option value="user">User</option>
        <option value="guest">Guest</option>
      </select>
      {fieldState.error && <span>{fieldState.error.message}</span>}
    </div>
  );
}
```

## Refactoring Checklist

When refactoring existing forms to react-hook-form:

1. [ ] Define Zod schema matching existing validation
2. [ ] Set up useForm with zodResolver and defaultValues
3. [ ] Replace controlled inputs with register() where possible
4. [ ] Use useController for third-party controlled components
5. [ ] Replace manual state management with form state
6. [ ] Convert submit handlers to use handleSubmit
7. [ ] Update error display to use formState.errors
8. [ ] Replace manual arrays with useFieldArray
9. [ ] Remove unnecessary useState for form values
