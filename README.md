# PHOTOS

Webova aplikace pro prohlizeni a tagovani fotek. Cisty HTML/CSS/JS frontend,
PHP + MySQL backend - bezi na beznem sdilenem webhostingu bez Node.js.

## Struktura

```
index.html          hlavni stranka (dlazdice fotek + panel s tagy/vylety)
css/style.css        styly
js/app.js            logika frontendu (nacitani dat, filtrovani, upload, lightbox)
api/config.php       pripojeni k DB - uprav udaje pred nasazenim
api/photos.php       GET seznam fotek (volitelne ?tag_id= nebo ?trip_id=)
api/upload.php       POST nahrani fotek (vytvari nahledy, cte EXIF)
api/tags.php         GET seznam tagu, POST vytvoreni/prirazeni/odebrani tagu
api/trips.php        GET seznam vyletu, POST vytvoreni vyletu
sql/schema.sql        SQL schema pro MySQL/MariaDB
uploads/originals/    originalni fotky (podle roku/mesice)
uploads/thumbs/       nahledy fotek
```

## Nasazeni na sdileny hosting

1. Zaloz MySQL databazi v administraci hostingu a nahraj do ni `sql/schema.sql`
   (napr. pres phpMyAdmin - zalozka Import).
2. Uprav `api/config.php` - vloz jmeno databaze, uzivatele a heslo od hostingu.
3. Nahraj cely obsah slozky na hosting pres FTP (nebo git, pokud to hosting
   podporuje).
4. Uisti se, ze slozka `uploads/` (a jeji podslozky) ma prava pro zapis
   (obvykle 755 nebo 775 - podle hostingu).
5. Otevri domenu v prohlizeci - mela by se zobrazit prazdna mrizka a panel
   s kategoriemi tagu.

## Pridani tagu / vyletu

Zatim neni v UI formular na vytvoreni tagu ani vyletu - da se to udelat primo
pres API, napr.:

```bash
curl -X POST https://tvoje-domena.cz/api/tags.php \
  -H "Content-Type: application/json" \
  -d '{"name":"Italie","category":"zeme"}'

curl -X POST https://tvoje-domena.cz/api/trips.php \
  -H "Content-Type: application/json" \
  -d '{"name":"Krkonose 2026","date_from":"2026-05-01","date_to":"2026-05-05"}'
```

V dalsim kroku pridame formulare primo do rozhrani.
