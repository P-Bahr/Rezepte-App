/* Kochtechniken und Fachwörter, die nicht jeder kennt (keine Alltagswörter wie EL oder abschmecken). In Zutaten, Schritten und Notizen
   werden sie markiert; Antippen zeigt eine kurze Erklärung. */
(function () {
  'use strict';

  // [Muster, Begriff, Erklärung]. \p{L}* erlaubt Wortformen (blanchieren, blanchiert …).
  const TERMS = [
    // Ofen: wofür man welche Einstellung nimmt
    [/Ober-\s*\/\s*Unterhitze/iu, 'Ober-/Unterhitze', 'Die richtige Wahl für Kuchen, Brot und Aufläufe: Die Hitze kommt sanft von oben und unten, der Teig geht gleichmäßig auf und bräunt schön, ohne auszutrocknen.'],
    [/(?<![\p{L}])Umluft(?![\p{L}])/iu, 'Umluft', 'Sinnvoll, wenn mehrere Bleche gleichzeitig in den Ofen sollen (z. B. Plätzchen) oder etwas rundum knusprig werden soll (Pommes, Hähnchen). Trocknet Kuchen eher aus. Etwa 20 °C weniger als bei Ober-/Unterhitze einstellen.'],
    // Garmethoden
    [/(?<![\p{L}])blanchier\p{L}*/iu, 'blanchieren', 'Kurz (1–3 Minuten) in kochendes Salzwasser geben und danach sofort in Eiswasser. Gemüse bleibt so knackig und behält seine Farbe.'],
    [/(?<![\p{L}])abschreck\p{L}*/iu, 'abschrecken', 'Direkt nach dem Kochen mit kaltem Wasser übergießen oder in Eiswasser legen. Das stoppt das Garen sofort (z. B. bei Eiern oder blanchiertem Gemüse).'],
    [/(?<![\p{L}])(an)?dünst\p{L}*/iu, 'dünsten', 'Bei mittlerer Hitze mit wenig Fett oder einem Schluck Flüssigkeit garen, meist mit Deckel. Nichts soll braun werden.'],
    [/(?<![\p{L}])glasig(?![\p{L}])/iu, 'glasig', 'Zwiebeln so lange dünsten, bis sie leicht durchsichtig sind, aber noch nicht braun.'],
    [/(?<![\p{L}])anschwitz\p{L}*/iu, 'anschwitzen', 'Kurz in etwas Fett bei mittlerer Hitze erhitzen, ohne dass es braun wird. Die Aromen lösen sich so besser.'],
    [/(?<![\p{L}])ablösch\p{L}*/iu, 'ablöschen', 'Flüssigkeit (Brühe, Sahne, Wein) in die heiße Pfanne gießen. Es zischt kurz, und die angebratenen Reste vom Pfannenboden lösen sich. Sie geben der Sauce Geschmack.'],
    [/(?<![\p{L}])pochier\p{L}*/iu, 'pochieren', 'In heißem, aber nicht kochendem Wasser langsam garen (ca. 75–80 °C, es darf sich nichts bewegen). Typisch für Eier oder Fisch.'],
    [/(?<![\p{L}])schmor\p{L}*/iu, 'schmoren', 'Erst scharf anbraten, dann mit etwas Flüssigkeit und Deckel lange bei kleiner Hitze garen. Macht Fleisch wie Gulasch zart.'],
    [/(?<![\p{L}])reduzier\p{L}*|(?<![\p{L}])einkoch\p{L}*/iu, 'reduzieren', 'Ohne Deckel kochen lassen, bis ein Teil der Flüssigkeit verdampft ist. Die Sauce wird dicker und schmeckt kräftiger.'],
    [/(?<![\p{L}])gratinier\p{L}*/iu, 'gratinieren', 'Im Ofen bei starker Hitze von oben überbacken, bis sich eine goldbraune Kruste bildet (meist mit Käse).'],
    [/(?<![\p{L}])karamellisier\p{L}*/iu, 'karamellisieren', 'Zucker (oder Zwiebeln, Möhren …) erhitzen, bis er goldbraun wird und nach Karamell schmeckt. Nicht zu dunkel werden lassen, sonst bitter.'],
    [/(?<![\p{L}])flambier\p{L}*/iu, 'flambieren', 'Hochprozentigen Alkohol über das Essen gießen und anzünden. Der Alkohol verbrennt, das Aroma bleibt.'],
    [/(?<![\p{L}])confier\p{L}*/iu, 'confieren', 'Langsam bei niedriger Temperatur in viel Fett oder Öl garen. Wird sehr zart.'],
    [/(?<![\p{L}])auslass\p{L}*|(?<![\p{L}])ausgelassen\p{L}*/iu, 'auslassen', 'Speck in der Pfanne langsam erhitzen, bis das Fett herausläuft und der Speck knusprig ist.'],
    [/(?<![\p{L}])ziehen lassen/iu, 'ziehen lassen', 'In heißer Flüssigkeit ohne weitere Hitze stehen lassen, damit es gart oder Geschmack annimmt (z. B. Klöße, Tee).'],
    // Teig und Backen
    [/(?<![\p{L}])unterheb\p{L}*|(?<![\p{L}])unterzuheben/iu, 'unterheben', 'Vorsichtig mit einem Teigschaber von unten nach oben mischen, nicht rühren. So bleibt die Luft im Teig oder in der Sahne.'],
    [/(?<![\p{L}])steif\s+schlag\p{L}*|(?<![\p{L}])steif\s+geschlagen\p{L}*|(?<![\p{L}])Eischnee(?![\p{L}])/iu, 'steif schlagen', 'Sahne oder Eiweiß mit dem Rührgerät schlagen, bis sie fest ist. Test: Schüssel umdrehen, nichts rutscht.'],
    [/(?<![\p{L}])blind\s*(zu\s*)?back\p{L}*|(?<![\p{L}])Blindbacken/iu, 'blindbacken', 'Den Teigboden ohne Füllung vorbacken. Dazu Backpapier darauflegen und mit getrockneten Hülsenfrüchten beschweren, damit er flach bleibt.'],
    [/(?<![\p{L}])Wasserbad(?![\p{L}])/iu, 'Wasserbad', 'Eine Schüssel über einen Topf mit heißem, nicht kochendem Wasser setzen. So schmilzt z. B. Schokolade, ohne anzubrennen.'],
    [/(?<![\p{L}])temperier\p{L}*/iu, 'temperieren', 'Schokolade schmelzen, etwas abkühlen und leicht wieder erwärmen. Dann glänzt sie und bricht später knackig.'],
    [/(?<![\p{L}])Stäbchenprobe(?![\p{L}])/iu, 'Stäbchenprobe', 'Ein Holzstäbchen in den Kuchen stechen. Bleibt kein Teig daran kleben, ist er fertig.'],
    [/(?<![\p{L}])gehen lassen/iu, 'gehen lassen', 'Hefeteig abgedeckt an einem warmen Ort stehen lassen, bis er sich sichtbar vergrößert hat (meist etwa verdoppelt).'],
    [/(?<![\p{L}])zur Rose abziehen/iu, 'zur Rose abziehen', 'Eiermasse unter Rühren erhitzen, bis sie andickt. Test: Auf den Kochlöffel pusten, es entstehen Wellen wie eine Rosenblüte.'],
    [/(?<![\p{L}])Mehlschwitze(?![\p{L}])|(?<![\p{L}])Roux(?![\p{L}])/iu, 'Mehlschwitze', 'Butter schmelzen, Mehl einrühren und kurz anschwitzen, dann Flüssigkeit dazu. Damit dickt man Saucen an.'],
    [/(?<![\p{L}])legier\p{L}*/iu, 'legieren', 'Eine Sauce oder Suppe mit Eigelb und Sahne andicken. Danach nicht mehr kochen, sonst gerinnt das Ei.'],
    [/(?<![\p{L}])abbind\p{L}*/iu, 'abbinden', 'Eine Flüssigkeit andicken, meist mit in kaltem Wasser angerührter Stärke.'],
    [/(?<![\p{L}])emulgier\p{L}*/iu, 'emulgieren', 'Fett und Flüssigkeit (z. B. Öl und Essig) kräftig verrühren, bis sie sich verbinden und nicht mehr trennen.'],
    // Schneiden und Zutaten
    [/(?<![\p{L}])Julienne(?![\p{L}])/iu, 'Julienne', 'In sehr feine, streichholzdünne Streifen geschnitten.'],
    [/(?<![\p{L}])Brunoise(?![\p{L}])/iu, 'Brunoise', 'In sehr kleine Würfel geschnitten (2–3 mm).'],
    [/(?<![\p{L}])Abrieb(?![\p{L}])|(?<![\p{L}])Zesten?(?![\p{L}])/iu, 'Abrieb', 'Nur die dünne, farbige äußere Schale fein abreiben (z. B. von Zitronen). Das Weiße darunter ist bitter.'],
    [/(?<![\p{L}])Fond(?![\p{L}])/iu, 'Fond', 'Kräftige Brühe als Grundlage für Saucen, z. B. aus Knochen und Gemüse. Gibt es auch im Glas zu kaufen.'],
    [/(?<![\p{L}])al dente(?![\p{L}])/iu, 'al dente', 'Nudeln so lange kochen, dass sie innen noch einen ganz leichten Biss haben.'],
    [/(?<![\p{L}])Fettpfanne(?![\p{L}])/iu, 'Fettpfanne', 'Das tiefe Backblech des Ofens mit höherem Rand (ca. 3–4 cm).'],
    [/(?<![\p{L}])Backrahmen(?![\p{L}])/iu, 'Backrahmen', 'Ein verstellbarer Metallrahmen ohne Boden, den man aufs Blech stellt. So läuft auch hoher Teig nicht über.']
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
