# 🛑 FIRST: read `ARCHITECTURE.md` → "PROTECTED CHANGES"

Security, money and privacy fixes in this app must not be undone. Before finishing any change run
`npm run verify`; never edit or delete a test to make it pass. If a requested change needs one of
the protected rules changed, stop and ask the user.

The full list, with the reason for each rule and the test that guards it, is at the top of `ARCHITECTURE.md`.


## Loading states
Follow ARCHITECTURE.md "Loading states" (rule 35) in every new screen: button actions use `useBusy` + `<ButtonSpinner />` (never `startLoading()`), page data uses `ContentSkeletons`, the global loader stays a 2px top bar. Do not bring back the full-screen blurred loader or a big wordmark.
