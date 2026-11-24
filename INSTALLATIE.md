# Tweakers Submitchecker – installatie

## Firefox
1. Open `about:debugging#/runtime/this-firefox`.
2. Klik **Tijdelijke add-on laden…** en kies `tweakers-submitchecker.xpi`.
3. Herlaad de submit queue. (Na een herstart van Firefox opnieuw laden.)

## Chrome (of Edge/Brave)
1. Pak `tweakers-submitchecker-chrome.zip` uit (rechtsklik > Alles uitpakken); je krijgt een map `tweakers-submitchecker-chrome` met daarin direct `manifest.json`.
2. Open `chrome://extensions` en zet rechtsboven **Ontwikkelaarsmodus** aan.
3. Klik **Uitgepakte extensie laden** en kies de map waarin `manifest.json` zichtbaar is.
4. Herlaad de submit queue. De extensie blijft staan na een herstart; laat de map wel staan.

## Gebruik
Boven de tabel verschijnt een balk "Submitchecker". De extensie haalt elk bronartikel op de achtergrond op
(er worden geen tabbladen geopend), leest de publicatiedatum en vinkt de rij aan als het artikel 2 kalenderdagen of ouder is.
Rood label = oud en aangevinkt, groen = recent, geel = datum onbekend. Hover over het label voor de bron van de datum.
Er wordt nooit iets verstuurd of verwijderd: dat doe je zelf met de knoppen.
