/* Beispielrezepte zum Ausprobieren von Suche und Filtern. */
window.EXAMPLE_RECIPES = [
  {
    title: 'Ofengemüse mit Feta', collection: 'Alltag', course: 'Hauptgericht', mainIngredient: 'Gemüse', method: 'Backen',
    servings: '2', totalTime: '40 Min.',
    ingredients: ['2 Paprika', '1 Zucchini', '1 rote Zwiebel', '200 g Feta', '3 EL Olivenöl', 'Salz, Pfeffer, Oregano'],
    steps: ['Ofen auf 200 °C Ober-/Unterhitze vorheizen.', 'Gemüse in Stücke schneiden, mit Öl und Gewürzen mischen.', 'Feta in die Mitte legen und 30 Minuten backen.'],
    notes: 'Schmeckt auch kalt am nächsten Tag.'
  },
  {
    title: 'Hähnchenbrust in Zitronen-Sahne', collection: 'Alltag', course: 'Hauptgericht', mainIngredient: 'Hähnchen', method: 'Braten',
    servings: '2', totalTime: '25 Min.',
    ingredients: ['2 Hähnchenbrustfilets', '200 ml Sahne', '1 Zitrone', '1 Knoblauchzehe', '1 EL Butter'],
    steps: ['Hähnchen salzen und in Butter von beiden Seiten goldbraun braten.', 'Knoblauch kurz mitbraten, mit Sahne ablöschen.', 'Zitronenabrieb und Saft dazugeben, 5 Minuten köcheln.'],
    notes: ''
  },
  {
    title: 'Linsensuppe', collection: 'Alltag', course: 'Suppe', mainIngredient: 'Linsen', method: 'Kochen',
    servings: '4', totalTime: '45 Min.',
    ingredients: ['250 g Tellerlinsen', '2 Möhren', '2 Kartoffeln', '1 Zwiebel', '1 l Gemüsebrühe', '2 EL Essig'],
    steps: ['Zwiebel würfeln und andünsten.', 'Gemüse würfeln, mit Linsen und Brühe 30 Minuten kochen.', 'Mit Essig, Salz und Pfeffer abschmecken.'],
    notes: 'Mit Würstchen oder Räuchertofu servieren.'
  },
  {
    title: 'Schokoladen-Brownies', collection: 'Backen & Süßes', course: 'Dessert', mainIngredient: 'Schokolade', method: 'Backen',
    servings: '12 Stück', totalTime: '45 Min.',
    ingredients: ['200 g Zartbitterschokolade', '150 g Butter', '200 g Zucker', '3 Eier', '100 g Mehl', '1 Prise Salz'],
    steps: ['Schokolade und Butter schmelzen.', 'Zucker und Eier unterrühren, dann Mehl und Salz.', 'In eine Form geben und bei 180 °C 25 Minuten backen.'],
    notes: 'Lieber etwas zu kurz backen, dann bleiben sie saftig.'
  },
  {
    title: 'Apfelkuchen vom Blech', collection: 'Backen & Süßes', course: 'Gebäck', mainIngredient: 'Äpfel', method: 'Backen',
    servings: '1 Blech', formSize: '30 × 40 cm', totalTime: '1 Std. 15 Min.',
    ingredients: ['1 kg Äpfel', '250 g Butter', '250 g Zucker', '5 Eier', '400 g Mehl', '1 Pck. Backpulver', 'Zimt'],
    steps: ['Butter, Zucker und Eier schaumig rühren.', 'Mehl und Backpulver unterheben, Teig aufs Blech streichen.', 'Äpfel in Spalten darauflegen, mit Zimt bestreuen, bei 180 °C 40 Minuten backen.'],
    notes: ''
  },
  {
    title: 'Käsekuchen ohne Boden', collection: 'Backen & Süßes', course: 'Gebäck', mainIngredient: 'Quark', method: 'Backen',
    servings: '1 Springform', formSize: 'Ø 26 cm', totalTime: '1 Std. 20 Min.',
    ingredients: ['1 kg Magerquark', '200 g Zucker', '4 Eier', '1 Pck. Vanillepuddingpulver', '125 g weiche Butter', '1 Zitrone'],
    steps: ['Ofen auf 175 °C Ober-/Unterhitze vorheizen, Form fetten.', 'Alle Zutaten glatt rühren.', 'In die Form füllen und 60 Minuten backen, im ausgeschalteten Ofen abkühlen lassen.'],
    notes: 'Dazu passt der Apfelkuchen, wenn viele Gäste kommen.'
  },
  {
    title: 'Tomaten-Mozzarella-Salat', collection: 'Schnell & einfach', course: 'Vorspeise', mainIngredient: 'Tomaten', method: 'Kalt zubereitet',
    servings: '2', totalTime: '10 Min.',
    ingredients: ['4 Tomaten', '1 Kugel Mozzarella', 'frisches Basilikum', '2 EL Olivenöl', '1 EL Balsamico'],
    steps: ['Tomaten und Mozzarella in Scheiben schneiden.', 'Abwechselnd auf einen Teller legen.', 'Mit Basilikum, Öl, Balsamico, Salz und Pfeffer anrichten.'],
    notes: ''
  },
  {
    title: 'Knusprige Ofenkartoffeln', collection: 'Schnell & einfach', course: 'Beilage', mainIngredient: 'Kartoffeln', method: 'Backen',
    servings: '4', totalTime: '50 Min.',
    ingredients: ['1 kg festkochende Kartoffeln', '3 EL Öl', '1 TL Paprikapulver', 'Rosmarin', 'Salz'],
    steps: ['Kartoffeln vierteln und mit Öl und Gewürzen mischen.', 'Auf einem Blech bei 220 °C 40 Minuten backen, einmal wenden.'],
    notes: 'Passt gut zu Lachs mit Honig-Senf-Kruste oder zur Hähnchenbrust.'
  },
  {
    title: 'Lachs mit Honig-Senf-Kruste', collection: 'Alltag', course: 'Hauptgericht', mainIngredient: 'Lachs', method: 'Backen',
    servings: '4', totalTime: '30 Min.',
    ingredients: ['4 Lachsfilets', '2 EL Honig', '2 EL Dijon-Senf', '1 Bund Dill', '1 Zitrone'],
    steps: ['Honig, Senf und gehackten Dill verrühren.', 'Auf den Lachs streichen.', 'Bei 200 °C 15 Minuten im Ofen garen.'],
    notes: 'Dazu passen die Ofenkartoffeln.'
  },
  {
    title: 'Gebratene Nudeln mit Gemüse', collection: 'Schnell & einfach', course: 'Hauptgericht', mainIngredient: 'Nudeln', method: 'Braten',
    servings: '2', totalTime: '20 Min.',
    ingredients: ['250 g Mie-Nudeln', '1 Paprika', '1 Möhre', '2 Frühlingszwiebeln', '3 EL Sojasauce', '1 EL Sesamöl'],
    steps: ['Nudeln nach Packung kochen.', 'Gemüse in Streifen schneiden und im Wok scharf anbraten.', 'Nudeln und Sojasauce dazugeben und 2 Minuten mitbraten.'],
    notes: ''
  },
  {
    title: 'Mango-Lassi', collection: 'Schnell & einfach', course: 'Getränk', mainIngredient: 'Mango', method: 'Kalt zubereitet',
    servings: '2 Gläser', formSize: '300 ml', totalTime: '5 Min.',
    ingredients: ['1 reife Mango', '300 g Joghurt', '100 ml Milch', '1 TL Honig', '1 Prise Kardamom'],
    steps: ['Alles im Mixer fein pürieren.', 'Kalt servieren.'],
    notes: ''
  }
];
