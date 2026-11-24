# Tweakers Submitchecker

Browserextensie voor de Tweakers submit queue: haalt de bronartikelen op, vinkt submits van 2 dagen of ouder aan en markeert dubbele submits.

## Installeren (Firefox)
Download [de nieuwste ondertekende versie](https://raw.githubusercontent.com/arnoudwokke/submitchecker/main/releases/tweakers-submitchecker-1.7.1.xpi) en open hem in Firefox. Daarna update de extensie zichzelf.

## Nieuwe Firefox-versie uitbrengen
1. Verhoog `version` in `extension/manifest.json` en upload de xpi op addons.mozilla.org (Eigen distributie / unlisted).
2. Download de door Mozilla ondertekende `.xpi` en zet hem in `releases/` als `tweakers-submitchecker-X.Y.Z.xpi`.
3. Voeg in `updates.json` een regel toe met die versie, de raw-downloadlink en `update_hash` (`sha256sum` van het bestand).
4. Commit en push. Firefox pikt de update binnen een dag automatisch op.
