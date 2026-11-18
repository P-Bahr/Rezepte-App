/* Kochbegriffe, die nicht jeder kennt. In Zutaten, Schritten und Notizen
   werden sie markiert; Antippen zeigt eine kurze Erklärung. */
(function () {
  'use strict';

  // [Muster, Begriff, Erklärung]. \p{L}* erlaubt Wortformen (blanchieren, blanchiert …).
  const TERMS = [
    [/(?<![\p{L}])EL(?![\p{L}])/u, 'EL', 'Esslöffel, ein normaler großer Löffel (ca. 15 ml). Gestrichen voll, nicht gehäuft.'],
    [/(?<![\p{L}])TL(?![\p{L}])/u, 'TL', 'Teelöffel, der kleine Löffel (ca. 5 ml). Gestrichen voll.'],
    [/(?<![\p{L}])Msp\.?/u, 'Msp.', 'Messerspitze: so viel, wie auf die Spitze eines Messers passt. Sehr wenig.'],
    [/(?<![\p{L}])Pck\.?/u, 'Pck.', 'Päckchen, z. B. ein Tütchen Backpulver oder Vanillezucker aus dem Supermarkt.'],
    [/(?<![\p{L}])Prisen?(?![\p{L}])/iu, 'Prise', 'So viel, wie zwischen Daumen und Zeigefinger passt. Eine kleine Menge zum Würzen.'],
    [/(?<![\p{L}])Bund(?![\p{L}])/u, 'Bund', 'Ein zusammengebundenes Büschel, so wie Kräuter oder Frühlingszwiebeln im Laden verkauft werden.'],
    [/Ober-\s*\/\s*Unterhitze/iu, 'Ober-/Unterhitze', 'Ofeneinstellung, bei der oben und unten geheizt wird, ohne Lüfter. Bei Umluft etwa 20 °C weniger einstellen.'],
    [/(?<![\p{L}])Umluft(?![\p{L}])/iu, 'Umluft', 'Ofeneinstellung mit Lüfter. Heizt gleichmäßiger; meist 20 °C weniger als bei Ober-/Unterhitze.'],
    [/(?<![\p{L}])vorheiz\p{L}*/iu, 'vorheizen', 'Den Ofen schon vor dem Backen einschalten, damit er die Temperatur erreicht hat, wenn das Essen hineinkommt.'],
    [/(?<![\p{L}])blanchier\p{L}*/iu, 'blanchieren', 'Kurz (1–3 Minuten) in kochendes Wasser geben und danach in kaltes Wasser. Gemüse bleibt so knackig und farbig.'],
    [/(?<![\p{L}])ablösch\p{L}*/iu, 'ablöschen', 'Flüssigkeit (z. B. Brühe, Sahne, Wein) in die heiße Pfanne gießen. Es zischt kurz, das Angebratene löst sich vom Boden.'],
    [/(?<![\p{L}])unterheb\p{L}*|(?<![\p{L}])unterzuheben/iu, 'unterheben', 'Vorsichtig mit einem Teigschaber von unten nach oben mischen, nicht rühren. So bleibt Luft im Teig.'],
    [/(?<![\p{L}])abschmeck\p{L}*/iu, 'abschmecken', 'Probieren und nach Geschmack nachwürzen, meist mit Salz und Pfeffer.'],
    [/(?<![\p{L}])schaumig(?![\p{L}])/iu, 'schaumig rühren', 'Mit dem Handrührgerät einige Minuten rühren, bis die Masse hell und luftig ist.'],
    [/(?<![\p{L}])(an)?düns\p{L}*/iu, 'dünsten', 'Bei mittlerer Hitze mit wenig Fett oder Flüssigkeit garen, ohne dass etwas braun wird.'],
    [/(?<![\p{L}])glasig(?![\p{L}])/iu, 'glasig', 'Zwiebeln so lange dünsten, bis sie leicht durchsichtig sind, aber noch nicht braun.'],
    [/(?<![\p{L}])anschwitz\p{L}*/iu, 'anschwitzen', 'Kurz in etwas Fett bei mittlerer Hitze erhitzen, ohne dass es braun wird.'],
    [/(?<![\p{L}])köchel\p{L}*|(?<![\p{L}])köcheln/iu, 'köcheln', 'Bei kleiner Hitze leise kochen lassen. Es blubbert nur ab und zu.'],
    [/(?<![\p{L}])reduzier\p{L}*|(?<![\p{L}])einköcheln/iu, 'reduzieren', 'Ohne Deckel kochen lassen, bis ein Teil der Flüssigkeit verdampft ist. Die Sauce wird dicker und kräftiger.'],
    [/(?<![\p{L}])steif\s+schlag\p{L}*|(?<![\p{L}])steif\s+geschlagen\p{L}*/iu, 'steif schlagen', 'Sahne oder Eiweiß mit dem Rührgerät schlagen, bis sie fest ist und Spitzen stehen bleiben.'],
    [/(?<![\p{L}])Wasserbad(?![\p{L}])/iu, 'Wasserbad', 'Eine Schüssel über einen Topf mit heißem, nicht kochendem Wasser setzen. So schmilzt z. B. Schokolade ohne anzubrennen.'],
    [/(?<![\p{L}])Stäbchenprobe(?![\p{L}])/iu, 'Stäbchenprobe', 'Ein Holzstäbchen in den Kuchen stechen. Bleibt kein Teig daran kleben, ist er fertig.'],
    [/(?<![\p{L}])al dente(?![\p{L}])/iu, 'al dente', 'Nudeln so lange kochen, dass sie innen noch einen ganz leichten Biss haben.'],
    [/(?<![\p{L}])karamellisier\p{L}*/iu, 'karamellisieren', 'Zucker (oder zuckerhaltiges Gemüse) erhitzen, bis er goldbraun wird und nach Karamell schmeckt.'],
    [/(?<![\p{L}])Abrieb(?![\p{L}])|(?<![\p{L}])Zesten?(?![\p{L}])/iu, 'Abrieb', 'Die dünne, farbige äußere Schale (z. B. von Zitronen) fein abgerieben. Nicht das Weiße darunter, das ist bitter.'],
    [/(?<![\p{L}])zimmerwarm(?![\p{L}])/iu, 'zimmerwarm', 'Rechtzeitig aus dem Kühlschrank nehmen, damit es Raumtemperatur hat. Lässt sich dann besser verrühren.'],
    [/(?<![\p{L}])gehen lassen|(?<![\p{L}])ruhen lassen/iu, 'gehen / ruhen lassen', 'Teig abgedeckt stehen lassen. Mit Hefe wird er dabei größer; Mürbeteig wird im Kühlschrank fester.'],
    [/(?<![\p{L}])Mehlschwitze(?![\p{L}])/iu, 'Mehlschwitze', 'Butter schmelzen, Mehl einrühren und kurz anschwitzen. Grundlage, um Saucen anzudicken.'],
    [/(?<![\p{L}])Fettpfanne(?![\p{L}])/iu, 'Fettpfanne', 'Das tiefe Backblech des Ofens mit höherem Rand (ca. 3–4 cm).'],
    [/(?<![\p{L}])Backrahmen(?![\p{L}])/iu, 'Backrahmen', 'Ein verstellbarer Metallrahmen ohne Boden, den man aufs Blech stellt. So läuft auch hoher Teig nicht über.'],
    [/(?<![\p{L}])Wok(?![\p{L}])/iu, 'Wok', 'Eine große, tiefe, gewölbte Pfanne. Eine normale große Pfanne geht auch.'],
    [/(?<![\p{L}])pürier\p{L}*/iu, 'pürieren', 'Mit dem Stabmixer oder Mixer ganz fein zerkleinern, bis es glatt ist.']
  ];

  /* Zerlegt Text in Stücke: [{ t: 'Text' }, { t: 'blanchieren', term: 'blanchieren', text: 'Erklärung' }, …].
     seen: Begriffe, die in diesem Rezept schon markiert wurden (jeder nur einmal). */
  function split(text, seen) {
    const out = [];
    let rest = String(text);
    while (rest) {
      let best = null;
      for (const [re, term, expl] of TERMS) {
        if (seen.has(term)) continue;
        const m = rest.match(re);
        if (m && (!best || m.index < best.m.index)) best = { m, term, expl };
      }
      if (!best) { out.push({ t: rest }); break; }
      if (best.m.index > 0) out.push({ t: rest.slice(0, best.m.index) });
      out.push({ t: best.m[0], term: best.term, text: best.expl });
      seen.add(best.term);
      rest = rest.slice(best.m.index + best.m[0].length);
    }
    return out;
  }

  window.RecipeGlossary = { split, TERMS };
})();
