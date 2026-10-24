---
inclusion: fileMatch
fileMatchPattern: "dashboard/**"
---
# Dashboard rules
- Read-only consumer of SirenEvent. Never add fields; derive anything new in the UI.
- Colors and type come from CSS variables in src/theme.css (pulled from Figma). No hard-coded colors.
- Every alert has text plus an icon, never color alone. AA contrast in both light and dark.
- The hosted build must work with zero backend: replay is the fallback, never an error screen.
- The demo is watched from the back of a room: key numbers at least 32 px.