# Text links and dropdowns

`public/css/controls.css` supplies subtle shared styling for inline links and
text actions. Overview customization, panel navigation, invoice references,
subscription notices, support/payment links, and account/legal links use the
page accent and a light underline that strengthens on hover or keyboard focus.
Sidebar navigation, card links, destructive actions and filled buttons retain
their established styling.

Native single-select controls reserve 38px for a 14px chevron placed 12px
inside the edge. Compact invoice status controls reserve 34px, with a 12px
chevron inset 10px. The right-to-left layout uses the opposite edge. Keyboard,
touch and option selection remain native; multiple/expanded listboxes and the
phone country picker's hidden backing select are excluded. Forced-colors mode
restores the system arrow.

The stylesheet loads after page-specific styles on the workspace, verification
and public pages. The standalone preview embeds it through the existing CSS
export step, including its SVG chevron, so it needs no external asset request.
