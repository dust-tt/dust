# MessageCard

A dismissible message card component designed for sidebar usage, featuring an optional image section and a new feature announcement section.

## Features

- **Optional Image**: Toggle to show/hide a background image
- **Dismissible**: Can be dismissed with a callback function
- **Responsive**: Adapts to different screen sizes
- **Accessible**: Proper ARIA labels and keyboard navigation
- **Dark mode support**: Includes dark mode styling

## Usage

```tsx
import { MessageCard } from "@sparkle/components/MessageCard";

<MessageCard
  haveImage={true}
  imageSrc="https://example.com/image.jpg"
  announcementMessage="Create interactive content with Dust Canvas"
  onDismiss={() => setIsVisible(false)}
  onLearnMore={() => handleLearnMore()}
/>;
```

## Props

| Prop                  | Type         | Default         | Description                              |
| --------------------- | ------------ | --------------- | ---------------------------------------- |
| `className`           | `string`     | -               | Additional CSS classes                   |
| `haveImage`           | `boolean`    | `false`         | Whether to show an image section         |
| `imageSrc`            | `string`     | -               | URL of the background image              |
| `announcementTitle`   | `string`     | `"New on Dust"` | Title for the announcement section       |
| `announcementMessage` | `string`     | -               | The main announcement message            |
| `learnMoreHref`       | `string`     | -               | URL to open when "Learn more" is clicked |
| `onLearnMore`         | `() => void` | -               | Callback when "Learn more" is clicked    |
| `onDismiss`           | `() => void` | -               | Callback when dismiss is clicked         |
| `dismissible`         | `boolean`    | `true`          | Whether the card can be dismissed        |

## Examples

### With Image

```tsx
<MessageCard
  haveImage={true}
  imageSrc="https://blog.dust.tt/content/images/size/w2000/2025/05/cover.jpg"
  announcementMessage="Create interactive content with Dust Canvas"
/>
```

### Without Image

```tsx
<MessageCard
  haveImage={false}
  announcementMessage="Create interactive content with Dust Canvas"
/>
```

### Non-dismissible

```tsx
<MessageCard
  announcementMessage="Create interactive content with Dust Canvas"
  dismissible={false}
/>
```

## Design Considerations

- Designed for sidebar usage with appropriate width constraints
- Uses Tailwind classes for consistent spacing and styling
- Supports both light and dark themes
- Responsive design that works on different screen sizes
- Accessible with proper contrast ratios and focus states
