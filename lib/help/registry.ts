import type { HelpKey, HelpTopic } from './types';

class HelpRegistryService {
  private topics: Map<string, HelpTopic> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
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
