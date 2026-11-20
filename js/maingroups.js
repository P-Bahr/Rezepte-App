/* Hauptzutat -> feste Gruppe für den Filter (statt immer mehr einzelner Zutaten).
   Im Rezept selbst bleibt die genaue Hauptzutat ("Lachs") stehen; die Suche findet sie weiterhin. */
(function () {
  'use strict';
  // Reihenfolge = Reihenfolge der Chips; die erste passende Regel gewinnt (Fisch vor Fleisch wegen "Lachsfilet")
  const RULES = [
    ['Süßes', /schoko|kakao|nougat|karamell|marzipan|nutella|keks|vanille|pudding|marmelade|konfitüre|honig|zucker|mandel|haselnuss|walnuss|erdnuss|pistazie|cashew|pekannuss|macadamia|nüsse|nuss\b/],
    ['Käse & Eier', /hühnerei|eiklar|eiweiß|eigelb|^eier$/],
    ['Gemüse', /grüne bohne|brechbohne|buschbohne|stangenbohne|zuckerschote|ofengemüse|grillgemüse/],
    ['Fisch', /fisch|lachs|thunfisch|forelle|kabeljau|seelachs|zander|garnele|shrimp|scampi|muschel|tintenfisch|calamar|hering|makrele|sardine|krabbe|meeresfrücht|dorsch|pangasius|rotbarsch|scholle|sardelle|anchovi|surimi/],
    ['Fleisch', /hähnchen|hühnchen|huhn|hühner(?!ei)|chicken|pute|truthahn|ente\b|gans|rind|kalb|schwein|hack|lamm|wild\b|reh\b|hirsch|wurst|würstchen|speck|schinken|bacon|salami|chorizo|fleisch|steak|schnitzel|gulasch|burger|filet|leber|kassler|frikadell|krakauer|wiener|bratwurst|würste|geflügel|gyros|döner|nacken|kotelett|braten|rouladen?/],
    ['Nudeln', /nudel|spaghetti|pasta|penne|fusilli|tagliatelle|linguine|lasagne|makkaroni|maccaroni|farfalle|rigatoni|tortellini|ravioli|gnocchi|spätzle|orzo|tortiglioni|conchiglie|mie\b|glasnudel|ramen|udon/],
    ['Kartoffeln', /kartoffel|pommes|kroketten|rösti/],
    ['Reis & Getreide', /reis|risotto|couscous|bulgur|quinoa|hirse|hafer|grieß|polenta|graupen|dinkel|brot|toast|brötchen|tortilla|wraps?\b|teig|knödel|klöße|haferflocken|müsli|granola|baguette|ciabatta|fladen|pizza|mehl/],
    ['Hülsenfrüchte', /linse|bohne|kichererbse|tofu|tempeh|soja|edamame|hummus|trockenerbse|hülsenfrücht/],
    ['Käse & Eier', /butter|käse|feta|mozzarella|parmesan|halloumi|ricotta|mascarpone|quark|joghurt|skyr|burrata|gouda|cheddar|camembert|brie|\bei\b|eier|milch|sahne|schmand|creme fraîche|crème fraîche/],
    ['Obst', /apfel|äpfel|birne|banane|beere|erdbeer|himbeer|heidelbeer|blaubeer|johannisbeer|kirsch|pflaume|zwetschg|aprikose|pfirsich|nektarine|mango|ananas|melone|orange|mandarine|zitrone|limette|kiwi|rhabarber|traube|obst|frucht|früchte|feige|dattel|kokos|granatapfel|maracuja|papaya/],
    ['Gemüse', /gemüse|zucchini|paprika|tomate|karotte|möhre|brokkoli|broccoli|blumenkohl|spinat|kohl|lauch|porree|zwiebel|pilz|champignon|aubergine|kürbis|spargel|gurke|salat|kohlrabi|sellerie|fenchel|bete|erbse|mais|avocado|mangold|rucola|radieschen|pastinake|rübe|artischocke|okra|bärlauch|kräuter|knoblauch|chili|oliven|rettich|schwarzwurzel|topinambur|wirsing|sauerkraut/]
  ];
  const ORDER = [...new Set(RULES.map(r => r[0]))].concat('Sonstiges');
  function groupOf(main) {
    const t = String(main || '').toLowerCase().trim();
    if (!t) return '';
    for (const [g, re] of RULES) if (re.test(t)) return g;
    return 'Sonstiges';
  }
  window.RecipeGroups = { groupOf, ORDER };
})();
