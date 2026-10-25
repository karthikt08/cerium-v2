# Text links and dropdowns

`public/css/controls.css` supplies shared styling for inline links and
text actions. Overview customization, panel navigation, invoice references,
subscription notices, support/payment links, and account/legal links use the
page accent, semibold text and a clear underline. Key workspace actions also
use a soft blue tint that strengthens on hover or keyboard focus.
Sidebar navigation, card links, destructive actions and filled buttons retain
their established styling.

Native single-select controls reserve 38px for a 16px chevron placed 12px
inside the edge. Compact invoice status controls reserve 34px, with a 14px
chevron inset 10px. The right-to-left layout uses the opposite edge. Hover and focus also emphasize the control border. Keyboard,
touch and option selection remain native; multiple/expanded listboxes and the
phone country picker's hidden backing select are excluded. Forced-colors mode
restores the system arrow.

On modern browsers supporting `appearance: base-select` (Chromium 135+), the
open dropdown listbox (`::picker(select)`) and its options are styled to blend
cleanly with Cerium's software cards: 12px rounded pop-up card, soft elevation
shadow, slim custom scrollbar, 7px option pills with Cerium blue selected highlight
and checkmark, and rotating chevrons. Fallback browsers retain standard option styling.

The stylesheet loads after page-specific styles on the workspace, verification
and public pages. The standalone preview embeds it through the existing CSS
export step, including its SVG chevron, so it needs no external asset request.
