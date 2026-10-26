# Mixed Doubles — DUPR Match-ups

Imported from the organizer's supplied Mixed_Doubles_DUPR_Matchups (1).pdf:
22 players, 11 rounds, three courts, 33 matches, six games per player.

Rules for this category: doubles side-out scoring, first to 11 (11–10 is valid), one game per match. Winner signature remains required. Each player on the winning pair gets one win. Individual standings rank wins descending, point difference descending, then total points scored descending. Exact ties share rank. Only confirmed matches count; standings derive from stored match records, so polling never adds wins twice.

The Brackets tab shows the complete rotating schedule and resting players. Organizers start each match on its prescribed court; occupied courts cannot be reused. The next round becomes ready only when all three matches in the current round are confirmed. Standings appear in the Standings, Scoreboard and Umpire views.

Player names can be edited in Categories before the first mixed match starts. Keep all 22 names in the original order. A rename updates every scheduled appearance. Team rating averages remain the PDF's reference values. No results are submitted to DUPR and no DUPR ratings are computed.

The fixed dataset in app/mixed.ts is added once to an existing tournament using a guarded revision update in the API's read helper. It accepts no request parameters and preserves all existing categories, results and umpire sessions. New tournaments include it at initialization. The stable category ID prevents repeated imports. Existing single-elimination categories retain their original win-by-two rules.

Checks: scripts/test-mixed.mjs validates appearances, conflicts, round progression, 11–10 and standings; scripts/test-api.mjs checks authorization, one-time import, roster locks, required courts, signature and duplicate-finish rejection.
