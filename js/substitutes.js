/* Alternativen für ausgefallene Zutaten, die man im normalen Supermarkt
   nicht immer bekommt. Nur Ersatz, der geschmacklich gut passt.
   Später kann die KI das für jedes importierte Rezept ergänzen. */
(function () {
  'use strict';
  const S = window.RecipeSearch;

  // [Suchmuster (auf vereinfachten Text: klein, ohne Umlaute), Alternative]
  const LIST = [
    [/\bdijon/, 'mittelscharfer Senf, gleiche Menge'],
    [/\bcreme fraiche\b/, 'Schmand oder saure Sahne'],
    [/\bcreme double\b/, 'Schlagsahne'],
    [/\bmascarpone\b/, 'Frischkäse (Doppelrahmstufe)'],
    [/\bricotta\b/, 'Magerquark oder glatt gerührter Hüttenkäse'],
    [/\bpecorino\b/, 'Parmesan'],
    [/\bgruyere\b/, 'Bergkäse oder Emmentaler'],
    [/\b(pancetta|guanciale)\b/, 'durchwachsener Speck'],
    [/\b(mie ?nudeln|mi nudeln|udon|ramen ?nudeln)\b/, 'Spaghetti oder Linguine'],
    [/\b(geroestetes |gerostetes )?sesamol\b/, 'Rapsöl mit etwas geröstetem Sesam'],
    [/\btahin[i]?\b/, 'helles Mandelmus oder ungesüßte Erdnussbutter (etwas weniger)'],
    [/\bkardamom\b/, 'eine Prise Zimt oder weglassen'],
    [/\bfischsauce\b/, 'Sojasauce, gleiche Menge'],
    [/\breisessig\b/, 'Apfelessig mit einer Prise Zucker'],
    [/\bmirin\b/, 'trockener Weißwein mit ½ TL Zucker'],
    [/\bmiso/, 'Sojasauce, etwa die Hälfte der Menge'],
    [/\bgochujang\b/, 'Tomatenmark mit Chiliflocken und einem Schuss Sojasauce'],
    [/\bsriracha\b/, 'scharfe Chilisauce'],
    [/\bbuttermilch\b/, 'Milch mit 1 EL Zitronensaft je 250 ml, 5 Minuten stehen lassen'],
    [/\bschalotte/, 'eine kleine, milde Zwiebel'],
    [/\blimette/, 'Zitrone'],
    [/\bkoriander(?! ?(samen|korner|pulver|gemahlen))(grun)?\b/, 'glatte Petersilie'],
    [/\bzitronengras\b/, 'Abrieb einer Zitrone'],
    [/\bgaram masala\b/, 'Currypulver'],
    [/\bpanko\b/, 'Semmelbrösel'],
    [/\bahornsirup\b/, 'Honig'],
    [/\bagavendicksaft\b/, 'Honig'],
    [/\bkokosblutenzucker\b/, 'brauner Zucker'],
    [/\bvanilleschote\b/, '1 Päckchen Bourbon-Vanillezucker oder 1 TL Vanilleextrakt'],
    [/\bchorizo\b/, 'scharfe Salami mit etwas geräuchertem Paprikapulver'],
    [/\bharissa\b/, 'Tomatenmark mit Chiliflocken und etwas Kreuzkümmel']
  ];

  function alternativeFor(line) {
    const text = S.normalize(line).replace(/\s+/g, ' ');
    for (const [re, alt] of LIST) if (re.test(text)) return alt;
    return null;
  }

  window.RecipeSubstitutes = { alternativeFor };
})();
