# Tweakers Submitchecker

Browserextensie voor de Tweakers submit queue: haalt de bronartikelen op, vinkt submits van 2 dagen of ouder aan en markeert dubbele submits.

## Nieuwe Firefox-versie uitbrengen
1. Verhoog `version` in `extension/manifest.json` en upload de xpi op addons.mozilla.org (Eigen distributie / unlisted).
2. Download de door Mozilla ondertekende `.xpi`.
3. Maak hier een GitHub Release met tag `vX.Y.Z` en hang de ondertekende xpi eraan als `tweakers-submitchecker-X.Y.Z.xpi`.
4. Voeg in `updates.json` een regel toe met die versie en downloadlink. Firefox pikt de update binnen een dag automatisch op.
