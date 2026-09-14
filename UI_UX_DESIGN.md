# Ybex UI/UX Design System & Guidelines

This document serves as the central source of truth for the UI/UX design system of the Ybex Creator & Brand Collaboration Platform. It outlines the visual language, component patterns, typography, and interactive behaviors ensuring a cohesive, premium, and futuristic user experience across all modules.

---

## 1. Visual Identity & Theme

The application adopts a **premium, dark-themed, "Cosmic Tech Space"** visual identity. It leverages deep charcoal and pure black backgrounds to make vibrant neon accents pop, ensuring high contrast, modern aesthetics, and reduce eye strain for long sessions.

### 1.1 Color Palette

**Backgrounds & Surfaces:**
- **App Background:** `#0A0A0B` (Deep cosmic black)
- **Panel/Surface Background:** `#12121A` (Elevated dark gray/blue)
- **Hover States / Light Surfaces:** `rgba(255, 255, 255, 0.05)` to `rgba(255, 255, 255, 0.1)`

**Primary Accents (Brand & Creator Distinction):**
- **Brand Identity Accent:** Purple/Violet (`#7C3AED` to `#6D28D9`). Used for brand-specific actions, brand chat bubbles, and primary platform highlights.
- **Creator/Action Accent:** Electric Lime/Yellow (`#D9F111`). Used for creator-specific actions, UGC claims, earnings highlights, and high-priority call-to-actions.
- **Success/Verified:** Emerald Green (`#10B981` or `#059669`)
- **Warning/Pending:** Amber/Orange (`#F59E0B` or `#D97706`)
- **Error/Destructive:** Rose/Red (`#EF4444`)

**Text & Typography Colors:**
- **Primary Text:** White (`#FFFFFF`) or `#F9FAFB` - High contrast for headings and core body text.
- **Secondary Text:** `rgba(255, 255, 255, 0.6)` or `#9CA3AF` - For descriptions, timestamps, and secondary labels.
- **Tertiary Text (Disabled/Subtle):** `rgba(255, 255, 255, 0.3)` or `#4B5563`

---

## 2. Typography

We utilize a modern, dual-font strategy to balance technical precision with approachable readability.

- **Primary Font (Sans-Serif):** `Inter` or system-ui. Used for all body copy, inputs, descriptions, and structural text. Provides excellent legibility at small sizes.
- **Display Font:** Custom `font-display` (e.g., Space Grotesk or similar bold geometric font). Used for large metrics, hero section titles, earnings numbers (e.g., `₹18,000`), and prominent callouts. 
- **Font Weights:**
  - `Regular (400)`: Standard body text.
  - `Medium (500)`: Buttons, tabs, and interactive labels.
  - `Bold (700)`: Headings, important data points, and active states.

---

## 3. Core UI Components

### 3.1 Buttons & Interactive Elements
- **Primary Button:** Uses the Electric Lime (`#D9F111`) or Purple (`#7C3AED`) background with black or white text respectively. Features hover transitions (`hover:scale-105` or opacity shifts).
- **Secondary Button:** Translucent white background (`bg-white/10`) with white text and border. Hovering increases opacity to `bg-white/20`.
- **Destructive Button:** Red accents with clear warning labeling.
- **Disabled State:** Reduced opacity (`opacity-50`) with `cursor-not-allowed`, ensuring users understand actions are temporarily restricted.

### 3.2 Navigation & Layout
- **Sidebar (Desktop):** Fixed left navigation. Active states are highlighted with left-border indicators or distinct background highlighting (`bg-white/5` with primary accent text).
- **Responsive Views (Mobile):** The layout gracefully collapses. Sidebars should transition to hamburger menus or bottom navigation bars for mobile contexts.
- **Cards & Containers:** Elements are housed in rounded cards (`rounded-2xl` or `rounded-3xl`) with subtle inner borders (`border border-white/5`) and soft drop shadows to create depth against the dark background.

### 3.3 Data Display & Badges
- **Status Badges:** Small, pill-shaped indicators (`rounded-full`, `px-2 py-0.5`, `text-xs`).
  - Active/Paid: Green background/text glow.
  - Pending/Negotiating: Amber/Yellow glow.
  - Delivered/Review: Blue or Purple glow.
- **Icons:** Consistent use of `lucide-react` for clean, scalable, stroke-based iconography.

---

## 4. User Experience (UX) Behaviors & Flows

### 4.1 Chat & Deal Negotiation (Core Module)
The Inbox/Chat interface bridges communication and contract negotiation.
- **Message Bubbles:**
  - Brand user sent: Purple (`bg-[#7C3AED]`).
  - Creator user sent: Lime Green (`bg-[#D9F111]`, black text).
  - System messages: Centered, translucent backgrounds, utilized for deal state changes (e.g., "Deal Approved", "Content Delivered").
- **Integrated Action Ribbons:** Action buttons (e.g., *Send Brief*, *Sign Agreement*, *Submit Content*) appear dynamically inline above the chat input based on the *Status* of the active thread (Negotiating → Active → Content Submitted → Approved).

### 4.2 Smooth Transitions & Micro-interactions
- **Framer Motion (`framer-motion`):** Used extensively for layout transitions, modal pop-ups, and list reordering.
- **Modals:** Slide in or fade in with a backdrop blur (`backdrop-blur-md`). Clicking outside the modal securely closes it.
- **Staggered Lists:** Invoice lists, campaign lists, and messages fade in with a slight vertical slide (`y: 10`, `opacity: 0` to `1`) providing a premium kinetic feel.
- **Scrollbars:** Custom minimal scrollbars (`no-scrollbar` classes or thin customized tracks) to prevent breaking the aesthetic immersion.

### 4.3 Contextual Awareness (Role-Based Views)
- **Creators vs. Brands:** The UI adapts to the logged-in role. Brands see "Creator Profiles" and "Brief Approval" flows. Creators see "Apply to Campaign", "Earnings", and "UGC Opportunities".
- **Dynamic Feedback:** Loading states, empty states (e.g., "No transactions yet"), and toast notifications successfully guide users without leaving them to guess system outcomes.

---

## 5. Accessibility & Future Considerations
- **Contrast Ratios:** Ensure text on translucent backgrounds always maintains high readability.
- **Focus States:** Keyboard navigation should highlight active inputs without disrupting the primary aesthetics.
- **Mobile First Expansion:** While highly optimized for desktop dashboard viewing, all flex grids and padding systems are built to scale down effectively.

***

*This design system is a living document and scales alongside the platform's features.*
