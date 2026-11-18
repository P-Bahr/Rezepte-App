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
  },
{
    title: 'Spaghetti Carbonara', collection: 'Alltag', course: 'Hauptgericht', mainIngredient: 'Nudeln', method: 'Kochen',
    servings: '4 Personen',
    ingredients: ['400 g Spaghetti', '150 g Pancetta', '4 Eigelb', '1 Ei', '80 g Pecorino', 'schwarzer Pfeffer'],
    steps: ['Spaghetti in reichlich Salzwasser al dente kochen.', 'Pancetta in Würfel schneiden und in einer Pfanne ohne Fett langsam auslassen, bis sie knusprig ist.', 'Eigelb, Ei und fein geriebenen Pecorino verrühren und kräftig pfeffern.', 'Spaghetti abgießen, dabei eine Tasse Nudelwasser auffangen.', 'Nudeln zur Pancetta geben, die Pfanne vom Herd nehmen und die Eiermasse mit etwas Nudelwasser unterrühren, bis eine cremige Sauce entsteht.'],
    notes: 'Die Pfanne muss vom Herd, sonst stockt das Ei und wird krümelig.'
  },
  {
    title: 'Grüne Bohnen mit Speck', collection: 'Alltag', course: 'Beilage', mainIngredient: 'Bohnen', method: 'Kochen',
    servings: '4 Personen',
    ingredients: ['500 g grüne Bohnen', '100 g Frühstücksspeck', '2 Schalotten', '1 EL Butter'],
    steps: ['Bohnen putzen und in kochendem Salzwasser 4 Minuten blanchieren.', 'Bohnen sofort in Eiswasser abschrecken und abtropfen lassen.', 'Schalotten fein würfeln, Speck in Streifen schneiden.', 'Speck in der Pfanne knusprig braten, Schalotten darin glasig dünsten.', 'Butter und Bohnen dazugeben, 3 Minuten schwenken, salzen und pfeffern.'],
    notes: 'Passt zur Hähnchenbrust in Zitronen-Sahne.'
  },
  {
    title: 'Rindergulasch', collection: 'Wochenende', course: 'Hauptgericht', mainIngredient: 'Rind', method: 'Schmoren',
    servings: '4 Personen',
    ingredients: ['1 kg Rindfleisch aus der Schulter', '500 g Zwiebeln', '2 EL Tomatenmark', '2 EL Paprikapulver edelsüß', '250 ml Rotwein', '500 ml Rinderfond', '2 EL Öl', '1 TL Kümmel'],
    steps: ['Fleisch in 3 cm große Würfel schneiden, trocken tupfen und in zwei Portionen im heißen Öl scharf anbraten. Herausnehmen.', 'Zwiebeln in Streifen schneiden und im Bratfett goldbraun braten.', 'Tomatenmark und Paprikapulver kurz mitrösten und mit dem Rotwein ablöschen.', 'Fleisch, Rinderfond und Kümmel dazugeben und zugedeckt bei kleiner Hitze 2 Stunden schmoren.', 'Deckel abnehmen und die Sauce 15 Minuten reduzieren. Mit Salz und Pfeffer abschmecken.'],
    notes: 'Schmeckt aufgewärmt am nächsten Tag noch besser. Dazu passen die Honig-Möhren und das Kartoffelgratin.'
  },
  {
    title: 'Kartoffelgratin', collection: 'Wochenende', course: 'Beilage', mainIngredient: 'Kartoffeln', method: 'Backen',
    servings: '4 Personen',
    ingredients: ['1 kg festkochende Kartoffeln', '200 ml Sahne', '200 ml Milch', '1 Zehe Knoblauch', '100 g Gruyère', 'Salz, Pfeffer, Muskat'],
    steps: ['Ofen auf 180 °C Umluft vorheizen. Eine Auflaufform mit der halbierten Knoblauchzehe ausreiben und fetten.', 'Kartoffeln schälen und in dünne Scheiben hobeln.', 'Sahne und Milch mit Salz, Pfeffer und Muskat würzen.', 'Kartoffeln dachziegelartig in die Form schichten und die Sahnemilch darübergießen.', 'Mit geriebenem Käse bestreuen und 50 Minuten backen, bis die Oberfläche goldbraun gratiniert ist.'],
    notes: 'Passt zum Rindergulasch.'
  },
  {
    title: 'Pochierte Eier auf Avocado-Toast', collection: 'Schnell & einfach', course: 'Frühstück', mainIngredient: 'Eier', method: 'Kochen',
    servings: '2 Personen',
    ingredients: ['4 Eier', '2 reife Avocados', '4 Scheiben Sauerteigbrot', '1 Limette', '2 EL heller Essig', 'Chiliflocken'],
    steps: ['Wasser mit dem Essig in einem Topf erhitzen, bis es kurz vor dem Kochen ist.', 'Eier einzeln in eine Tasse schlagen, mit einem Löffel einen Strudel ins Wasser rühren und die Eier hineingleiten lassen.', 'Eier 4 Minuten pochieren und mit einer Schaumkelle herausheben.', 'Brot rösten. Avocado mit Limettensaft, Salz und Pfeffer zerdrücken und auf das Brot streichen.', 'Eier darauflegen und mit Chiliflocken bestreuen.'],
    notes: 'Ganz frische Eier halten beim Pochieren am besten zusammen.'
  },
  {
    title: 'Tiramisu', collection: 'Backen & Süßes', course: 'Dessert', mainIngredient: 'Mascarpone', method: 'Kalt zubereitet',
    servings: '6 Personen',
    ingredients: ['500 g Mascarpone', '4 sehr frische Eier', '80 g Zucker', '200 g Löffelbiskuits', '300 ml kalter Espresso', '2 EL Kakaopulver'],
    steps: ['Eier trennen. Eigelb mit Zucker schaumig rühren und die Mascarpone glatt unterrühren.', 'Eiweiß steif schlagen und vorsichtig unterheben.', 'Löffelbiskuits kurz in den Espresso tauchen und eine Form damit auslegen.', 'Die Hälfte der Creme darauf verteilen, dann noch einmal Biskuits und Creme schichten.', 'Mindestens 4 Stunden kühlen und vor dem Servieren mit Kakao bestäuben.'],
    notes: 'Am besten schon am Vortag zubereiten.'
  },
  {
    title: 'Schokoladen-Mousse im Glas', collection: 'Backen & Süßes', course: 'Dessert', mainIngredient: 'Schokolade', method: 'Kalt zubereitet',
    servings: '6 Gläser', formSize: '150 ml',
    ingredients: ['200 g Zartbitterschokolade', '3 Eier', '1 Prise Salz', '2 EL Zucker', '200 ml Sahne'],
    steps: ['Schokolade grob hacken, über dem Wasserbad schmelzen und etwas abkühlen lassen.', 'Eier trennen. Eiweiß mit Salz steif schlagen, dabei den Zucker einrieseln lassen.', 'Sahne in einer zweiten Schüssel ebenfalls fest aufschlagen.', 'Eigelb unter die Schokolade rühren, dann Sahne und Eischnee nacheinander unterheben.', 'In die Gläser füllen und mindestens 3 Stunden kalt stellen.'],
    notes: 'Dazu passen ein paar frische Himbeeren.'
  },
  {
    title: 'Bananenbrot', collection: 'Backen & Süßes', course: 'Gebäck', mainIngredient: 'Bananen', method: 'Backen',
    servings: '1 Kastenform', formSize: '30 cm',
    ingredients: ['3 sehr reife Bananen', '80 g weiche Butter', '120 g brauner Zucker', '2 Eier', '250 g Mehl', '1 Pck. Backpulver', '1 TL Zimt', '50 g Walnüsse'],
    steps: ['Ofen auf 175 °C Ober-/Unterhitze vorheizen und die Kastenform fetten.', 'Bananen mit einer Gabel zerdrücken.', 'Butter und Zucker schaumig rühren, Eier einzeln unterrühren, dann die Bananen dazugeben.', 'Mehl, Backpulver und Zimt mischen, kurz unterrühren und die gehackten Walnüsse unterheben.', 'Teig in die Form füllen und 55 Minuten backen. Mit der Stäbchenprobe prüfen.'],
    notes: 'Je brauner die Bananen, desto süßer und saftiger wird das Brot.'
  },
  {
    title: 'Hefezopf', collection: 'Backen & Süßes', course: 'Gebäck', mainIngredient: 'Mehl', method: 'Backen',
    servings: '1 Stück',
    ingredients: ['500 g Mehl', '1 Würfel frische Hefe (42 g)', '250 ml lauwarme Milch', '75 g Zucker', '75 g weiche Butter', '1 Ei', '1 Prise Salz', '1 Eigelb zum Bestreichen', '2 EL Hagelzucker'],
    steps: ['Hefe in der lauwarmen Milch mit 1 TL Zucker auflösen.', 'Mit Mehl, restlichem Zucker, Butter, Ei und Salz 5 Minuten zu einem glatten Teig kneten.', 'Abgedeckt an einem warmen Ort 1 Stunde gehen lassen.', 'Teig in drei Stränge teilen, einen Zopf flechten und auf dem Blech weitere 30 Minuten ruhen lassen.', 'Mit verquirltem Eigelb bestreichen, mit Hagelzucker bestreuen und bei 180 °C Ober-/Unterhitze 30 Minuten backen.'],
    notes: 'Statt frischer Hefe geht auch 1 Päckchen Trockenhefe, die kommt direkt ins Mehl.'
  },
  {
    title: 'Quiche Lorraine', collection: 'Wochenende', course: 'Hauptgericht', mainIngredient: 'Speck', method: 'Backen',
    servings: '1 Springform', formSize: 'Ø 26 cm',
    ingredients: ['200 g Mehl', '100 g kalte Butter', '4 Eier', '1 Prise Salz', '150 g Speckwürfel', '1 Zwiebel', '200 g Crème fraîche', '100 g geriebener Bergkäse', 'Pfeffer, Muskat'],
    steps: ['Mehl, kalte Butter in Stücken, 1 Ei und Salz rasch zu einem Mürbeteig verkneten und 30 Minuten kalt stellen.', 'Teig ausrollen, die Form damit auslegen, einen Rand hochziehen und den Boden 15 Minuten bei 200 °C blindbacken.', 'Speck in der Pfanne auslassen, die gewürfelte Zwiebel darin glasig dünsten.', 'Crème fraîche, 3 Eier und Käse verquirlen, mit Pfeffer und Muskat würzen.', 'Speck und Zwiebel auf dem Boden verteilen, die Eiermasse darübergießen und bei 180 °C 35 Minuten backen.'],
    notes: 'Dazu passt ein grüner Salat.'
  },
  {
    title: 'Honig-Möhren', collection: 'Alltag', course: 'Beilage', mainIngredient: 'Möhren', method: 'Dünsten',
    servings: '4 Personen',
    ingredients: ['600 g Möhren', '2 EL Butter', '1 EL Honig', '100 ml Gemüsebrühe', '½ Bund glatte Petersilie'],
    steps: ['Möhren schälen und schräg in Scheiben schneiden.', 'Butter in einer Pfanne schmelzen und die Möhren darin 3 Minuten anschwitzen.', 'Brühe angießen und zugedeckt 8 Minuten dünsten.', 'Deckel abnehmen, Honig dazugeben und die Möhren unter Rühren leicht karamellisieren.', 'Mit Salz, Pfeffer und gehackter Petersilie bestreuen.'],
    notes: 'Passt zum Rindergulasch.'
  },
  {
    title: 'Rotes Thai-Curry mit Hähnchen', collection: 'Alltag', course: 'Hauptgericht', mainIngredient: 'Hähnchen', method: 'Kochen',
    servings: '4 Personen',
    ingredients: ['500 g Hähnchenbrustfilet', '400 ml Kokosmilch', '2 EL rote Currypaste', '1 rote Paprika', '150 g Zuckerschoten', '1 Stange Zitronengras', '1 EL Fischsauce', '1 Limette', '1 Bund Koriander'],
    steps: ['Hähnchen in Streifen schneiden, Paprika in Streifen schneiden und Zuckerschoten halbieren.', 'Currypaste mit etwas Kokosmilch in einem Topf 2 Minuten anrösten.', 'Restliche Kokosmilch und das angedrückte Zitronengras dazugeben und aufkochen.', 'Hähnchen und Gemüse hinzufügen und 10 Minuten köcheln lassen.', 'Zitronengras entfernen, mit Fischsauce und Limettensaft abschmecken und mit Koriander bestreuen.'],
    notes: 'Dazu Basmati- oder Jasminreis.'
  },
  {
    title: 'Vanillesoße', collection: 'Backen & Süßes', course: 'Sauce & Dip', mainIngredient: 'Milch', method: 'Kochen',
    servings: '4 Personen',
    ingredients: ['500 ml Milch', '1 Vanilleschote', '4 Eigelb', '60 g Zucker'],
    steps: ['Vanilleschote längs aufschneiden, das Mark herauskratzen und mit Schote und Milch aufkochen. Schote entfernen.', 'Eigelb und Zucker verrühren und die heiße Milch unter Rühren langsam dazugießen.', 'Alles zurück in den Topf geben und bei kleiner Hitze unter ständigem Rühren zur Rose abziehen. Nicht kochen lassen.', 'Durch ein Sieb gießen und warm oder kalt servieren.'],
    notes: 'Passt zum Apfelkuchen vom Blech und zu den Schokoladen-Brownies.'
  },
  {
    title: 'Champignon-Rahmsuppe', collection: 'Alltag', course: 'Suppe', mainIngredient: 'Champignons', method: 'Kochen',
    servings: '4 Personen',
    ingredients: ['500 g Champignons', '1 Zwiebel', '2 EL Butter', '2 EL Mehl', '750 ml Gemüsebrühe', '150 ml Sahne', '1 Eigelb', '½ Bund Petersilie'],
    steps: ['Champignons putzen und in Scheiben schneiden, Zwiebel fein würfeln.', 'Butter schmelzen, Zwiebel glasig dünsten und die Champignons 5 Minuten mitbraten.', 'Mehl darüberstäuben und kurz anschwitzen, sodass eine Mehlschwitze entsteht. Nach und nach mit der Brühe ablöschen.', '15 Minuten köcheln lassen und fein pürieren.', 'Sahne mit Eigelb verquirlen und die Suppe damit legieren. Danach nicht mehr kochen lassen.'],
    notes: 'Mit gehackter Petersilie bestreut servieren.'
  }
];
