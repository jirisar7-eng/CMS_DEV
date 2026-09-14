import type { HelpKey, HelpTopic } from './types';

class HelpRegistryService {
  private topics: Map<string, HelpTopic> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // 1. OBSAH (Content)
    this.register({
      helpKey: 'admin.dashboard.view',
      title: 'Přehled administrace (Dashboard)',
      shortSummary: 'Centrální přehled stavu publikace, aktivity redakce a rychlých akcí.',
      extendedBody:
        'V přehledu administrace vidíte klíčové ukazatele celého webu: počet konceptů čekajících na schválení, aktivní verze a nedávné redakční úpravy. Odtud můžete přímo přejít do správy stránek nebo vytvořit novou stránku jedním kliknutím.',
      tags: ['administrace', 'přehled', 'navigace'],
    });

    this.register({
      helpKey: 'content.pages.view',
      title: 'Správa a přehled stránek',
      shortSummary: 'Strukturovaný strom a tabulka všech stránek projektu s filtry a stavem.',
      extendedBody:
        'V tomto přehledu můžete procházet hierarchickou strukturu stránek, filtrovat podle stavu životního cyklu (Koncept, Ke kontrole, Publikováno apod.) nebo vyhledávat podle cesty a názvu. Kliknutím na řádek otevřete detail konkrétní stránky.',
      tags: ['stránky', 'strom', 'filtry', 'lifecycle'],
    });

    this.register({
      helpKey: 'content.page.create',
      title: 'Vytvoření nové stránky',
      shortSummary: 'Založení nového uzlu v obsahu s automatickým generováním URL cesty.',
      extendedBody:
        'Při zakládání stránky zadejte název, ze kterého se automaticky vygeneruje URL slug s ohledem na českou diakritiku. Můžete zvolit rodičovskou stránku pro zařazení do stromu a určit počáteční stav (výchozí je Koncept).',
      tags: ['vytvoření', 'slug', 'hierarchie', 'koncept'],
    });

    this.register({
      helpKey: 'content.page.edit',
      title: 'Editace a detail stránky',
      shortSummary: 'Úprava metadat, správa SEO parametrů a vstup do vizuálního editoru.',
      extendedBody:
        'Detail stránky slouží jako centrální uzel pro konfiguraci cesty, titulku, SEO metadat a revizí. Tlačítkem „Upravit obsah“ vstoupíte do vizuálního editoru (Composer), kde sestavujete bloky obsahu.',
      tags: ['detail', 'úpravy', 'metadata', 'seo'],
    });

    this.register({
      helpKey: 'content.block.create',
      title: 'Katalog a vkládání bloků',
      shortSummary: 'Výběr kanonických obsahových bloků z palety a jejich přidání na plátno.',
      extendedBody:
        'Z levého panelu (Katalog bloků) můžete vybírat ze standardních Synthesis bloků (Hero banner, Textový odstavec, Vizuální mřížka). Kliknutím na blok se automaticky vloží na konec stránky, kde jej můžete ihned upravit.',
      tags: ['katalog', 'bloky', 'plátno', 'composer'],
    });

    this.register({
      helpKey: 'content.block.edit',
      title: 'Panel vlastností bloku (Inspector)',
      shortSummary: 'Nastavení parametrů, textů a formátování vybraného bloku na plátně.',
      extendedBody:
        'Pravý panel (Inspector) zobrazuje vlastnosti právě aktivního bloku. Můžete měnit texty, zarovnání, vizuální styl a provádět strukturální operace (přesunutí nahoru/dolů, duplikace, smazání bloku).',
      tags: ['inspector', 'vlastnosti', 'pořadí', 'duplikace'],
    });

    this.register({
      helpKey: 'content.draft.save',
      title: 'Ukládání konceptu',
      shortSummary: 'Průběžné ukládání změn v editoru bez vlivu na živý publikovaný web.',
      extendedBody:
        'Uložení konceptu zapíše vaše rozpracované úpravy do databáze. Změny zůstávají v neveřejném stavu a neovlivňují produkční web, dokud stránku neschválíte a nepublikujete.',
      tags: ['koncept', 'ukládání', 'bezpečnost', 'verzování'],
    });

    this.register({
      helpKey: 'content.preview',
      title: 'Režim náhledu (Preview)',
      shortSummary: 'Zobrazení věrné podoby stránky bez editačních ovládacích prvků.',
      extendedBody:
        'Režim náhledu přepne editor do plného zobrazení, jak jej uvidí návštěvníci webu. Můžete testovat responzivitu v různých šířkách (Desktop, Tablet, Mobil) přímo v administračním rozhraní.',
      tags: ['náhled', 'responzivita', 'desktop', 'mobil'],
    });

    this.register({
      helpKey: 'content.publish',
      title: 'Publikace a životní cyklus',
      shortSummary: 'Přechod ze stavu schváleno do produkčního publikování.',
      extendedBody:
        'Publikace provede kontrolu integrity obsahu a vytvoří neměnnou verzi (release), která je okamžitě dostupná na veřejné URL adrese. Předchozí verze zůstávají v historii pro možnost rychlého rollbacku.',
      tags: ['publikace', 'produkce', 'rollback', 'schválení'],
    });

    this.register({
      helpKey: 'content.media.view',
      title: 'Knihovna médií (Media Library)',
      shortSummary: 'Centrální úložiště obrázků, dokumentů, ikon a multimediálních aktiv.',
      extendedBody:
        'Knihovna médií zajišťuje optimalizované nahrávání a správu souborů. Každý nahraný obrázek je optimalizován, opatřen metadaty a chráněn před nechtěným smazáním při aktivním použití na stránkách.',
      tags: ['média', 'obrázky', 'dokumenty', 'úložiště'],
    });

    this.register({
      helpKey: 'media.library',
      title: 'Knihovna médií a správa digitálních aktiv',
      shortSummary: 'Přehled, filtrování, vyhledávání a organizace všech multimediálních souborů webu.',
      extendedBody:
        'Knihovna médií poskytuje mřížkové i řádkové zobrazení aktiv. Umožňuje rychlé fulltextové vyhledávání podle názvu, ALT textu, popisu i štítků a filtrování podle typu souboru (obrázky, vektorová grafika, dokumenty, audio, video). Každé aktivum je uloženo s izolovaným úložištním klíčem.',
      tags: ['média', 'knihovna', 'filtry', 'aktiva', 'správa'],
    });

    this.register({
      helpKey: 'media.upload',
      title: 'Bezpečné nahrávání souborů (Upload Pipeline)',
      shortSummary: 'Politika povolených typů souborů, validace velikosti a bezpečnostní kontrola.',
      extendedBody:
        'Nahrávací pipeline ověřuje soubory ve více fázích:\n\n1. Validace MIME typu a přípony souboru (blokace spustitelných souborů .exe, .sh, .bat, skriptů).\n2. Kontrola limitu velikosti (výchozí 25 MB).\n3. Antivirová kontrola a detekce aktivního obsahu (např. sanitace SVG s potenciálními skripty).\n4. Generování bezpečného izolovaného klíče v úložišti (uživatelský název se nikdy nepoužívá jako fyzická cesta).',
      tags: ['nahrávání', 'upload', 'bezpečnost', 'validace', 'antivir'],
    });

    this.register({
      helpKey: 'media.alt',
      title: 'Přístupnost a alternativní text (ALT)',
      shortSummary: 'Zásady psaní popisků obrázků pro zrakově znevýhodněné uživatele a vyhledávače.',
      extendedBody:
        'Alternativní text (ALT) je klíčový pro přístupnost (čtečky obrazovky) a SEO indexaci. Měl by věcně a stručně popsat, co je na obrázku zobrazeno a jaký má význam v kontextu stránky. U čistě dekorativních prvků může zůstat prázdný, ale systém vyžaduje vědomé nastavení.',
      tags: ['alt', 'přístupnost', 'seo', 'popis', 'metadata'],
    });

    this.register({
      helpKey: 'media.replace',
      title: 'Výměna souboru se zachováním vazeb',
      shortSummary: 'Nahrazení fyzického souboru novou verzí bez rozbití existujících odkazů na stránkách.',
      extendedBody:
        'Funkce Nahradit soubor umožňuje nahrát aktualizovanou verzi aktiva (např. upravenou fotografii nebo novou verzi PDF ceníku) při zachování stejného ID a storage klíče. Všechny bloky a stránky, které toto médium používají, automaticky zobrazí novou verzi bez nutnosti ručního přelinkování.',
      tags: ['výměna', 'nahradit', 'aktualizace', 'vazby'],
    });

    this.register({
      helpKey: 'media.delete',
      title: 'Ochrana před smazáním a bezpečnostní pravidla',
      shortSummary: 'Destruktivní smazání je blokováno, pokud je médium používáno na kterékoli stránce.',
      extendedBody:
        'Aby se předešlo vzniku neplatných odkazů (broken links) a chybějících obrázků na veřejném webu, systém aktivně kontroluje reference:\n\n• Pokud je médium použito na 1 nebo více stránkách, tlačítko Smazat je zablokováno a zobrazí se přesný seznam odkazujících stránek a bloků.\n• V takovém případě je doporučeno médium archivovat, nebo nejprve odstranit vazbu z příslušných stránek.\n• Smazat lze pouze nepoužívaná média (počet referencí = 0).',
      tags: ['smazání', 'ochrana', 'reference', 'bezpečnost', 'archiv'],
    });

    this.register({
      helpKey: 'media.usage',
      title: 'Sledování výskytu a referencí médií',
      shortSummary: 'Přehled všech stránek a bloků, které dané aktivum aktivně využívají.',
      extendedBody:
        'Systém automaticky eviduje vazby mezi bloky stránek a médii. V detailu aktiva vidíte přesný počet referencí, názvy stránek, URL adresy a konkrétní bloky (např. Hero sekce, Tým, Záhlaví), kde je soubor vložen. Kliknutím na odkaz můžete přejít přímo do editoru dané stránky.',
      tags: ['použití', 'reference', 'výskyt', 'stránky', 'vazby'],
    });

    this.register({
      helpKey: 'content.navigation.view',
      title: 'Správa navigace a stromu menu',
      shortSummary: 'Konfigurace navigačních nabídek, záhlaví, patičky a mobilních menu.',
      extendedBody:
        'V sekci Navigace vytváříte a spravujete hierarchické navigační struktury. Položky lze odkazovat na interní stránky, externí adresy i kotevní body s možností nastavení oprávnění a cílového okna.',
      tags: ['navigace', 'menu', 'záhlaví', 'patička'],
    });

    this.register({
      helpKey: 'navigation.manager',
      title: 'Správce navigačních sad (Navigation Manager)',
      shortSummary: 'Centrální správa a přepínání kontextů nabídek (Záhlaví, Patička, Mobilní menu, Portál).',
      extendedBody:
        'Správce navigace umožňuje vytvářet a konfigurovat nezávislé sady odkazů pro různé části webu:\n\n• Záhlaví (Header): Hlavní navigační lišta s podporou víceúrovňových rozbalovacích nabídek.\n• Patička (Footer): Sloupcová struktura odkazů, skupin a právních náležitostí.\n• Mobilní menu (Mobile/Drawer): Optimalizovaná stromová navigace pro dotyková zařízení.\n• Portál / Uživatelská zóna: Odkazy pro přihlášené uživatele nebo klientský systém.\n\nKaždá sada disponuje vlastním verzováním, stavem a detekcí neplatných odkazů.',
      tags: ['navigace', 'sady', 'menu', 'záhlaví', 'patička', 'mobil'],
    });

    this.register({
      helpKey: 'navigation.item',
      title: 'Položka navigace a typologie odkazů',
      shortSummary: 'Typy navigačních uzlů: Kanonická stránka, Externí URL, Kotva a Skupinový nadpis.',
      extendedBody:
        'Synthesis CMS podporuje čtyři typy položek:\n\n1. Interní stránka (PAGE): Odkazuje na kanonickou stránku v CMS podle trvalého pageId. Při změně URL slug se odkaz automaticky udrží v konzistentním stavu.\n2. Externí odkaz (EXTERNAL_LINK): Směřuje na vnější webovou adresu. Vyžaduje bezpečný protokol (https://, http://) a automaticky vynucuje rel="noopener noreferrer".\n3. Kotva (ANCHOR): Odkaz na sekci stejné stránky (např. #kontakt, #cenik).\n4. Skupina (GROUP): Organizační hlavička bez vlastního prokliku, sloužící ke strukturování sloupců v patičce nebo mega menu.',
      tags: ['položka', 'odkaz', 'stránka', 'externí', 'kotva', 'skupina'],
    });

    this.register({
      helpKey: 'navigation.internal_link',
      title: 'Vazba na interní kanonickou stránku',
      shortSummary: 'Provázání navigace s objektem stránky podle trvalého identifikátoru.',
      extendedBody:
        'Navigační položka typu Stránka ukládá referenci na kanonické pageId. Tím je zajištěno, že pokud dojde k přejmenování stránky nebo změně hierarchie ve stromu stránek, navigační menu zůstane funkční a odkazuje na správnou aktuální URL adresu.',
      tags: ['interní', 'stránka', 'pageId', 'kanonická', 'slug'],
    });

    this.register({
      helpKey: 'navigation.external_link',
      title: 'Bezpečnost externích odkazů a sanitace URL',
      shortSummary: 'Validace protokolů, ochrana před zranitelnostmi a bezpečné otevírání v novém okně.',
      extendedBody:
        'Bezpečnostní pravidla pro externí odkazy:\n\n• Zakázány jsou nebezpečné protokoly javascript:, data:, vbscript: i lokální souborová schémata.\n• Povoleny jsou výhradně validní webové a komunikační protokoly (https://, http://, mailto:, tel:).\n• Otevírání v novém okně (target="_blank") povinně doplňuje atribut rel="noopener noreferrer" k zamezení útoku typu tabnabbing.',
      tags: ['externí', 'url', 'bezpečnost', 'sanitace', 'noopener', 'xss'],
    });

    this.register({
      helpKey: 'navigation.reorder',
      title: 'Změna pořadí a úrovně zanoření (Přístupnost)',
      shortSummary: 'Klávesnicová alternativa k drag-and-drop: posun nahoru/dolů a zanoření/vyjmutí.',
      extendedBody:
        'Synthesis CMS striktně dodržuje pravidla přístupnosti (a11y). Všechny editační operace stromu navigace jsou plně ovladatelné jak myší, tak čistě z klávesnice:\n\n• Posunout nahoru / dolů: Změna pořadí položky mezi sourozenci ve stejné úrovni.\n• Zanořit (Indent): Povýšení položky na podpoložku předcházejícího prvku (max. do hloubky 3).\n• Vyjmout (Outdent): Posun položky o úroveň výše k rodičovským prvkům.\n\nSystém automaticky brání vzniku cyklických vazeb ve stromu.',
      tags: ['pořadí', 'hierarchie', 'zanoření', 'klávesnice', 'přístupnost', 'a11y'],
    });

    this.register({
      helpKey: 'navigation.visibility',
      title: 'Řízení viditelnosti položek',
      shortSummary: 'Dočasné skrytí navigační položky na veřejném webu bez nutnosti jejího smazání.',
      extendedBody:
        'Položku navigace lze jednoduše deaktivovat (přepínač Viditelnost). Skrytá položka i její případné podpoložky zůstávají uloženy v administračním modelu, ale veřejný renderer a živé menu ji ignorují. V administraci je skrytá položka vizuálně označena.',
      tags: ['viditelnost', 'skrytí', 'aktivní', 'draft'],
    });

    this.register({
      helpKey: 'navigation.broken_reference',
      title: 'Detekce a oprava neplatných referencí (Broken Links)',
      shortSummary: 'Identifikace položek odkazujících na smazané či neexistující stránky.',
      extendedBody:
        'Pokud je v systému smazána nebo archivována stránka, na kterou stále odkazuje položka menu, systém odkaz NIKDY tiše nesmaže ani nenechá rozbitý. V přehledu navigace se okamžitě zobrazí varovný indikátor neplatné reference (Broken Reference) s možností:\n\n1. Přeorientovat odkaz na jinou existující stránku.\n2. Změnit typ položky na externí URL nebo kotvu.\n3. Položku s vědomým potvrzením odstranit z navigace.',
      tags: ['neplatný odkaz', 'broken link', 'reference', 'integrita', 'oprava'],
    });

    this.register({
      helpKey: 'content.publishing.view',
      title: 'Publikační pipeline a verze (Releases)',
      shortSummary: 'Přehled nasazených verzí obsahu, plánování publikace a okamžitý rollback.',
      extendedBody:
        'Synthesis CMS využívá neměnný model verzí. Každá publikace vytvoří podepsaný snapshot celého webu. V případě potřeby lze jedním kliknutím vrátit ukazatel na předchozí stabilní verzi bez ztráty historie.',
      tags: ['publikování', 'verze', 'snapshot', 'rollback'],
    });

    this.register({
      helpKey: 'content.revisions.view',
      title: 'Revize a historie změn',
      shortSummary: 'Detailní porovnání rozdílů (diff) mezi jednotlivými úpravami stránek.',
      extendedBody:
        'Zde můžete procházet časovou osu všech změn v obsahu, vidět autora úprav a porovnat dvě libovolné revize bloku po bloku. Lze obnovit dřívější stav stránky přímo do nového konceptu.',
      tags: ['revize', 'historie', 'diff', 'verzování'],
    });

    this.register({
      helpKey: 'content.seo.view',
      title: 'Globální SEO a Open Graph',
      shortSummary: 'Nastavení metadat pro vyhledávače, generování sitemap.xml a robots.txt.',
      extendedBody:
        'Konfigurujte globální šablony meta titulků a popisků, výchozí obrázky pro sdílení na sociálních sítích (Open Graph / Twitter Cards), kanonickou doménu a pravidla indexace.',
      tags: ['seo', 'sitemap', 'robots', 'opengraph'],
    });

    this.register({
      helpKey: 'content.redirects.view',
      title: 'Správa přesměrování (Redirects)',
      shortSummary: 'Pravidla pro přesměrování URL adres (HTTP 301, 302) s počítadlem přístupů.',
      extendedBody:
        'Umožňuje definovat trvalá (301) i dočasná (302) přesměrování pro zachování SEO pozic při změně struktury webu. Podporuje přesné shody i zástupné znaky a sleduje četnost využití každého pravidla.',
      tags: ['přesměrování', '301', '302', 'url'],
    });

    this.register({
      helpKey: 'content.search.view',
      title: 'Vyhledávání a indexace',
      shortSummary: 'Nastavení fulltextového vyhledávání a statistiky vyhledávacích dotazů.',
      extendedBody:
        'Spravujte vyhledávací index webu, prahy relevance pro našeptávač a analyzujte, co návštěvníci nejčastěji hledají a jaké dotazy končí bez výsledku pro optimalizaci obsahu.',
      tags: ['vyhledávání', 'fulltext', 'indexace', 'analytika'],
    });

    // 2. DESIGN
    this.register({
      helpKey: 'design.themes.view',
      title: 'Vzhledy a Theme Packy',
      shortSummary: 'Správa designových tokenů, barevných palet, typografie a poloměrů.',
      extendedBody:
        'Synthesis Theme Packy definují kompletní vizuální styl webu pomocí sémantických tokenů. Změna motivu okamžitě promítne barvy, kontrasty a typografické měřítko do celé prezentace i administrace.',
      tags: ['vzhled', 'motivy', 'design tokeny', 'typografie'],
    });

    this.register({
      helpKey: 'design.brands.view',
      title: 'Identita značek (Brands)',
      shortSummary: 'Konfigurace logotypů, favicon, aplikačních ikon a firemních prvků.',
      extendedBody:
        'Nastavte loga pro světlý i tmavý režim, vektorové ikony pro záložky prohlížeče, mobilní domovské obrazovky a metadata identity projektu či studia pro automatické vkládání do patiček.',
      tags: ['značky', 'logo', 'favicon', 'identita'],
    });

    this.register({
      helpKey: 'design.svg_editor.view',
      title: 'SVG Editor',
      shortSummary: 'Vektorový editor SVG aktiv v bezpečném vývojovém režimu.',
      extendedBody:
        'SVG Editor slouží k tvorbě a úpravě vektorových aktiv. Aktuální verze je DEV PREVIEW. Import, ukládání a publikování nejsou aktivní. Produkční SVG musí před uložením a publikací projít autoritativní serverovou SVG security pipeline.',
      tags: ['svg', 'editor', 'design', 'vektor', 'bezpečnost'],
    });

    this.register({
      helpKey: 'design.pwa.view',
      title: 'Progressive Web App (PWA)',
      shortSummary: 'Nastavení instalačního manifestu a offline chování webové aplikace.',
      extendedBody:
        'PWA modul umožňuje instalaci webu jako samostatné aplikace na mobilní telefony a počítače. Konfigurujte barvu stavového řádku, výchozí ikony a strategii mezipaměti Service Workeru.',
      tags: ['pwa', 'mobilní', 'offline', 'manifest'],
    });

    // 3. SPRÁVA (Management)
    this.register({
      helpKey: 'management.modules.view',
      title: 'Správa modulů a rozšíření',
      shortSummary: 'Aktivace a konfigurace systémových a doménových modulů.',
      extendedBody:
        'Zde můžete aktivovat rozšiřující moduly (např. Blog, Formuláře, Analytika). Každý modul má striktně definované závislosti, oprávnění a verzi kompatibilní se systémovým jádrem.',
      tags: ['moduly', 'rozšíření', 'komponenty', 'správa'],
    });

    this.register({
      helpKey: 'management.users.view',
      title: 'Uživatelské účty a přístupy',
      shortSummary: 'Správa redakčních a administrátorských účtů s dvoufázovým ověřením.',
      extendedBody:
        'Přehled všech uživatelů s přístupem do administrace. Můžete zvát nové redaktory a administrátory, přiřazovat jim role, vynucovat 2FA ověření a v případě potřeby účet dočasně deaktivovat.',
      tags: ['uživatelé', 'účty', 'role', '2fa'],
    });

    this.register({
      helpKey: 'management.roles.view',
      title: 'Role a oprávnění (RBAC)',
      shortSummary: 'Matice přístupových práv podle principu nejnižších privilegií (Zero Trust).',
      extendedBody:
        'Definujte pravidla oprávnění pro jednotlivé role (Administrátor, Editor, Redaktor, Korektor). Každá akce v systému (čtení, zápis, publikace, správa) je autorizována na straně serveru.',
      tags: ['role', 'oprávnění', 'rbac', 'bezpečnost'],
    });

    this.register({
      helpKey: 'management.audit.view',
      title: 'Auditní protokol událostí',
      shortSummary: 'Neměnný bezpečnostní log všech přihlášení, změn obsahu a konfigurace.',
      extendedBody:
        'Kompletní auditní stopa každé operace v CMS. Zaznamenává identitu uživatele, IP adresu, časové razítko a přesný diff provedených změn pro splnění přísných bezpečnostních standardů.',
      tags: ['audit', 'protokol', 'bezpečnost', 'logy'],
    });

    // 4. KOMUNIKACE (Communication)
    this.register({
      helpKey: 'communication.notifications.view',
      title: 'Centrum notifikací',
      shortSummary: 'Systémová upozornění, redakční zprávy a stav publikačních procesů.',
      extendedBody:
        'Přehled všech zpráv o dění v redakci: nové komentáře k revizím, žádosti o schválení publikace, bezpečnostní varování a dokončení plánovaných úloh. Možnost filtrace a označení jako přečtené.',
      tags: ['notifikace', 'upozornění', 'zprávy', 'redakce'],
    });

    this.register({
      helpKey: 'communication.templates.view',
      title: 'Šablony zpráv a e-mailů',
      shortSummary: 'Správa transakčních šablon pro systémové e-maily a formulářové odpovědi.',
      extendedBody:
        'Vytvářejte a upravujte šablony pro automatické e-maily (potvrzení registrace, obnova hesla, notifikace odeslání kontaktního formuláře) s podporou dynamických proměnných a náhledu.',
      tags: ['šablony', 'emaily', 'transakce', 'komunikace'],
    });

    // 5. DATA
    this.register({
      helpKey: 'data.analytics.view',
      title: 'Webová analytika (Privacy-First)',
      shortSummary: 'Metriky návštěvnosti bez sledovacích cookies v plném souladu s GDPR.',
      extendedBody:
        'Sledujte návštěvnost webu, nejčastěji zobrazované stránky, zařízení návštěvníků a zdroje odkazů bez narušení soukromí uživatelů a bez nutnosti ukládání invazivních souborů cookies.',
      tags: ['analytika', 'návštěvnost', 'metriky', 'soukromí'],
    });

    this.register({
      helpKey: 'data.import_export.view',
      title: 'Import a export dat (Portabilita)',
      shortSummary: 'Zálohování a přenos kompletního obsahu webu a médií.',
      extendedBody:
        'Synthesis CMS garantuje plnou datovou nezávislost. Zde můžete jedním kliknutím exportovat celý web do standardního archivu (JSON + média) nebo obnovit data ze zálohy.',
      tags: ['export', 'import', 'záloha', 'portabilita'],
    });

    // 6. BEZPEČNOST (Security)
    this.register({
      helpKey: 'security.overview.view',
      title: 'Zabezpečení a bezpečnostní štít',
      shortSummary: 'Přehled bezpečnostního stavu, SSL/TLS certifikátů a HTTP hlaviček.',
      extendedBody:
        'Centrální dashboard bezpečnostních prvků: stav TLS šifrování, konfigurace bezpečnostních HTTP hlaviček (CSP, HSTS, X-Frame-Options), ochrana proti brute-force útokům a rate-limiting.',
      tags: ['zabezpečení', 'ssl', 'tls', 'headers', 'ochrana'],
    });

    this.register({
      helpKey: 'security.sessions.view',
      title: 'Aktivní relace a zařízení',
      shortSummary: 'Přehled přihlášených zařízení a možnost vzdáleného odhlášení.',
      extendedBody:
        'Zobrazuje seznam všech aktivních relací k vašemu účtu včetně informací o prohlížeči, operačním systému, IP adrese a času poslední aktivity s možností okamžitého odhlášení jiných relací.',
      tags: ['relace', 'zařízení', 'přihlášení', 'odhlášení'],
    });

    this.register({
      helpKey: 'security.privacy.view',
      title: 'GDPR a ochrana soukromí',
      shortSummary: 'Správa souhlasů se zpracováním údajů, cookie lišta a žádosti o výmaz.',
      extendedBody:
        'Nástroje pro správu souladu s evropským nařízením GDPR: konfigurace kategorií cookies (Nezbytné, Analytické, Funkční), protokol souhlasů a procesy pro anonymizaci osobních údajů.',
      tags: ['gdpr', 'soukromí', 'cookies', 'souhlasy'],
    });

    // 7. SYSTÉM (System)
    this.register({
      helpKey: 'system.settings.view',
      title: 'Globální systémové nastavení',
      shortSummary: 'Základní parametry projektu, lokalizace, časové pásmo a režim údržby.',
      extendedBody:
        'Nastavte název webu, výchozí jazyk rozhraní a obsahu (cs-CZ), formát data a času, základní URL adresu a v případě potřeby aktivujte dočasný režim údržby s vlastní zprávou pro návštěvníky.',
      tags: ['nastavení', 'systém', 'lokalizace', 'údržba'],
    });

    this.register({
      helpKey: 'system.integrations.view',
      title: 'Integrace a externí služby',
      shortSummary: 'Napojení na webhooky, cloudová úložiště a externí API služby.',
      extendedBody:
        'Spravujte bezpečné klíče a připojení k externím systémům (objektová úložiště pro média, e-mailové brány, analytické platformy a automatizační webhooky pro CI/CD).',
      tags: ['integrace', 'api', 'webhooky', 'služby'],
    });

    this.register({
      helpKey: 'system.diagnostics.view',
      title: 'Systémová diagnostika a stav',
      shortSummary: 'Kontrola zdraví běhového prostředí, databáze a paměťových prostředků.',
      extendedBody:
        'Technický přehled stavu aplikace: verze Node.js a Next.js, latence spojení s PostgreSQL databází, využití operační paměti a CPU, stav mezipaměti a propustnost sítě.',
      tags: ['diagnostika', 'zdraví', 'paměť', 'databáze'],
    });

    this.register({
      helpKey: 'system.logs.view',
      title: 'Systémové logy a záznamy chyb',
      shortSummary: 'Živý náhled protokolů aplikace s možností filtrace podle závažnosti.',
      extendedBody:
        'Prohlížejte systémové události a chybová hlášení v reálném čase. Umožňuje filtrování podle úrovně (INFO, WARN, ERROR), vyhledávání podle klíčových slov a export do souboru.',
      tags: ['logy', 'chyby', 'protokol', 'ladění'],
    });

    this.register({
      helpKey: 'system.queues.view',
      title: 'Fronty a plánované úlohy (Cron)',
      shortSummary: 'Monitorování asynchronních úloh, generování sitemap a čištění mezipaměti.',
      extendedBody:
        'Přehled úloh na pozadí: stav zpracování fronty, plánovač pravidelných úloh (obnova vyhledávacího indexu, kontrola odkazů, archivace dat) a možnost manuálního spuštění úlohy.',
      tags: ['úlohy', 'fronty', 'cron', 'plánovač'],
    });

    // 8. PLATFORMA (Platform & Hosting Ready)
    this.register({
      helpKey: 'platform.projects.view',
      title: 'Správa projektů a prostředí',
      shortSummary: 'Přepínání mezi projekty a správou vývojového, staging a produkčního prostředí.',
      extendedBody:
        'Synthesis CMS umožňuje správu více nezávislých webových projektů v rámci jednoho ekosystému s oddělenými datovými vrstvami a prostředími (DEV, STAGING, PROD).',
      tags: ['projekty', 'prostředí', 'multitenant', 'platforma'],
    });

    this.register({
      helpKey: 'platform.project_packs.view',
      title: 'Project Packy a šablony',
      shortSummary: 'Znovupoužitelné distribuční balíčky s předkonfigurovanými moduly a tématy.',
      extendedBody:
        'Project Packy představují certifikované sady bloků, témat a modulů optimalizované pro konkrétní typ webu (např. Standardní firemní web, Zpravodajský portál, E-commerce).',
      tags: ['project packy', 'šablony', 'distribuce', 'moduly'],
    });

    this.register({
      helpKey: 'platform.deployment.view',
      title: 'Deployment a Cloud Run hosting',
      shortSummary: 'Přehled CI/CD pipeline, stavu kontejneru a neměnného Git kontrolního součtu (SHA).',
      extendedBody:
        'Tato sekce poskytuje přehled o nasazení aplikace v Google Cloud Run. Zobrazuje aktuální aktivní Git SHA commit, stav sestavení, zdravotní testy kontejneru a auditní historii nasazení v souladu s pravidly Notion CMS specifikace.',
      tags: ['deployment', 'hosting', 'cloud run', 'git', 'ci/cd'],
    });

    // 9. GENERAL & STATUS MODEL
    this.register({
      helpKey: 'system.status_model',
      title: 'Sémantika stavového modelu schopností',
      shortSummary: 'Pravdivé označení úrovně připravenosti jednotlivých schopností v administraci Synthesis CMS.',
      extendedBody:
        'Synthesis CMS používá přísně pravdivý stavový model pro každou z 31 schopností:\n\n• FUNKČNÍ: Plná end-to-end implementace napojená na reálnou perzistenci a autoritativní poskytovatele.\n• PROTOTYP: Interaktivní pracovní postup běžící nad in-memory adaptérem nebo lokálními fixture daty bez napojení na produkční databázi.\n• UI PŘIPRAVENO: Vizuální obrazovka a rozhraní (shell) je kompletně navrženo a responzivní, ale aplikační/backendová logika zatím není připojena.\n• PLÁNOVÁNO: Schopnost je schválena v architektuře a roadmapě, ale zatím není implementována.\n• VYPNUTO: Implementovaná schopnost je záměrně deaktivována konfigurací nebo bezpečnostní politikou.',
      tags: ['stav', 'prototyp', 'funkční', 'governance', 'pravdivost'],
    });

    this.register({
      helpKey: 'theme.switch',
      title: 'Přepínání vizuálního motivu',
      shortSummary: 'Volba mezi světlým režimem, tmavým režimem a synchronizací se systémem.',
      extendedBody:
        'Přepínač motivu umožňuje přizpůsobit vzhled administrace i náhledu. K dispozici je Světlý (Light), Tmavý (Dark) a Systémový (System) režim s okamžitým přepnutím bez nutnosti obnovení stránky.',
      tags: ['motiv', 'vzhled', 'dark mode', 'kontrast'],
    });
  }

  public register(topic: HelpTopic): void {
    this.topics.set(topic.helpKey, topic);
  }

  public getTopic(helpKey: HelpKey | string): HelpTopic {
    const existing = this.topics.get(helpKey);
    if (existing) {
      return existing;
    }

    // Deterministic, safe fallback for unknown keys (Contract requirement)
    return {
      helpKey,
      title: `Nápověda: ${helpKey}`,
      shortSummary: 'K tomuto prvku nebyla nalezena specifická nápověda.',
      extendedBody:
        'Tento prvek rozhraní zatím nemá přiřazený podrobný popis v centrálním registru nápovědy. Pro více informací se obraťte na administrátora systému Synthesis CMS.',
      tags: ['obecné', 'systém'],
      fallback: true,
    };
  }

  public getAllTopics(): HelpTopic[] {
    return Array.from(this.topics.values());
  }
}

export const helpRegistry = new HelpRegistryService();
