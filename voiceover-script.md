# Voiceover script — PTA Collection Management System

79-second cut. Read at a calm pace; each line has slack built in.
Narration starts ~0.3s after each scene begins.

| # | In | Out | Scene | Line |
|---|----|-----|-------|------|
| 1 | 0:00.00 | 0:05.50 | title | This is the PTA Collection Management System, built for Philippine schools. |
| 2 | 0:05.50 | 0:12.00 | problem | Right now, most PTA collections run on a receipt booklet, and one officer's spreadsheet. |
| 3 | 0:12.00 | 0:20.50 | dashboard | From the very first screen, the school sees everything. What was assessed, what came in, and who still owes. |
| 4 | 0:20.50 | 0:27.50 | search | A cashier finds any student by name, student number, or L R N, with the balance already on screen. |
| 5 | 0:27.50 | 0:36.50 | payment | They tick only the fees the parent is paying. The total adds itself, and it cannot be typed over. |
| 6 | 0:36.50 | 0:45.00 | overpay | Try to collect more than a fee is worth, and the system simply will not accept it. |
| 7 | 0:45.00 | 0:54.50 | confirm | Before anything is saved, the rule is stated plainly. A payment can never be edited. Only voided, with a reason. |
| 8 | 0:54.50 | 1:01.50 | receipt | The parent walks away with an official receipt, numbered for your school alone, and never reissued. |
| 9 | 1:01.50 | 1:09.00 | reports | And the treasurer gets every report. Daily, per cashier, outstanding, and the annual P T A report. |
| 10 | 1:09.00 | 1:19.00 | outro | Let's run one school year, side by side. To arrange a demo, contact Mar Roma, at zero nine two zero. three nine four. four seven nine five. |

## Recording notes

- Record each line as a separate file named `<scene>.wav` (48 kHz mono).
- Drop them into `public/vo/` replacing the synthetic ones, then re-run `npx remotion render`.
- Keep each line under the scene's length: title 5.5s, problem 6.5s, dashboard 8.5s,
  search 7.0s, payment 9.0s, overpay 8.5s, confirm 9.5s, receipt 7.0s, reports 7.5s, outro 10.0s.
- A phone voice memo in a quiet room beats any synthetic voice for this audience.
