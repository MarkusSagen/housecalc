# Excel-export av bostadskalkyl — design

## Syfte

Från `index.html`-vyn (med de valda slider-värdena) kunna exportera en
Excel-fil att skicka till banken. Filen visar kostnadsbilden i tre block:
förutsättningar, månadskostnad och engångskostnader ("Du behöver i kontanter").

All text i den exporterade filen är på **svenska** (inget språkval).

## Format

En äkta `.xlsx`-fil (öppnas rent i Excel / Numbers / Google Sheets utan
reparationsvarningar). Ingen tung tredjepartsberoende läggs till — appen är
ett enda `index.html`.

En liten självständig skrivare (~180 rader vanilla JS) läggs till i det
befintliga `<script>`-blocket:

- Bygger de sex XML-delarna i en minimal arbetsbok:
  - `[Content_Types].xml`
  - `_rels/.rels`
  - `xl/workbook.xml`
  - `xl/_rels/workbook.xml.rels`
  - `xl/styles.xml`
  - `xl/worksheets/sheet1.xml`
- Packar delarna i ett ZIP-arkiv med **store-läge (ingen komprimering)** plus en
  liten CRC32-tabell — därför behövs ingen DEFLATE och inget externt bibliotek.
- Laddas ner via en `Blob` + temporär `<a download>`.

Belopp skrivs som **riktiga tal med Excel-talformat** så att banken kan
summera/redigera cellerna:

- kr-belopp: `#,##0" kr"`
- kr/mån-belopp: `#,##0" kr/mån"`
- procent: `0.0" %"` (ränta använder `0.00" %"`)

Kommatecken som decimaltecken och mellanslag som tusentalsavgränsare renderas
automatiskt i en svensk Excel-locale.

## Trigger / UI

En ny knapp **"Exportera till Excel"** i hero-summeringskortet, bredvid
"Se jämförelsen →". Vid klick:

1. Läs nuvarande slider-tillstånd via `readPrimaryParams()`.
2. Beräkna via `computeForPrice(price, params)`.
3. Bygg `.xlsx` och ladda ner som `Housecalc-bostadskalkyl-YYYY-MM-DD.xlsx`
   (dagens datum).

Knappen återanvänder befintlig knappstil i hero-kortet.

## Arkstruktur (svensk, två kolumner: etikett | värde)

```
Housecalc – Bostadskalkyl              (titel, fet)
Underlag till banken · YYYY-MM-DD

FÖRUTSÄTTNINGAR                        (sektionsrubrik, fet + fyllning)
Förväntat slutpris          6 800 000 kr
Kontantinsats                 680 000 kr
Ränta                             2,54 %
Amortering                         2,0 %
Avgift / drift              5 879 kr/mån
Befintliga pantbrev         2 248 000 kr
Bolån                       6 120 000 kr
LTV                              90,0 %

MÅNADSKOSTNAD
Ränta                      12 954 kr/mån
Amortering                 10 200 kr/mån
Avgift / drift              5 879 kr/mån
Totalt före skatt          29 033 kr/mån   (fet)

DU BEHÖVER I KONTANTER
Kontantinsats                 680 000 kr
+ Lagfart (1,5 %)             102 825 kr
+ Pantbrev (2 % av nya)        77 815 kr
Summa kontanter               860 640 kr   (fet)
```

### Datakällor per cell

Alla från `computeForPrice()` / `readPrimaryParams()`:

| Rad | Källa |
| --- | --- |
| Förväntat slutpris | `price` |
| Kontantinsats | `hpTotal` |
| Ränta | `params.rate` |
| Amortering | `params.amort` |
| Avgift / drift | `monthlyFee` |
| Befintliga pantbrev | `params.existingPantbrev` |
| Bolån | `loan` |
| LTV | `ltv` |
| Månad: Ränta | `monthlyInterest` |
| Månad: Amortering | `monthlyAmort` |
| Månad: Avgift / drift | `monthlyFee` |
| Totalt före skatt | `monthlyTotal` |
| Kontantinsats | `hpTotal` |
| + Lagfart | `lagfart` |
| + Pantbrev | `pantbrev` |
| Summa kontanter | `onetimeTotal` |

**Avgränsning:** Ingen "Efter ränteavdrag"-rad och ingen bankjämförelsetabell
(ENGÅNGSKOSTNADER-blocket utelämnat eftersom det dubblerar "Du behöver i
kontanter").

## Testning

Den sköra delen är den handrullade `.xlsx`-genereringen. Verifiering:

1. Öppna den nedladdade filen lokalt och bekräfta att den öppnas **utan**
   reparations-/formatvarning.
2. Bekräfta att talen matchar hero-värdena på skärmen för samma slider-läge.
