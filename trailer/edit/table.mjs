// Table de montage de la bande-annonce : une ligne par beat. C'est la seule chose à modifier
// pour changer le montage ; npm run trailer:animatic reconstruit tout (animatique, FCPXML, CSV).
//   { beat, clip, in, out, notes }     extrait d'un plan (id de trailer/shots.js), en secondes du plan
//   { beat, gap, card?, notes }        noir de gap secondes, avec un carton de texte facultatif
// Les entrées / sorties viennent des planches contact (trailer/out/draft/<plan>/<plan>-sheet.jpg).
export const EDIT = {
  title: 'Snake.io — bande-annonce',
  project: 'Animatique v2',
  fps: 60,
  rows: [
    { beat: 'Ouverture', clip: 'arena-reveal', in: 0, out: 2, notes: 'Gros plan : un cobra royal chasse au milieu des petits.' },
    { beat: 'Coupe la route', clip: 'cut-off', in: 0.6, out: 5, notes: 'Course côte à côte, le cobra se rabat, le crotale s\'écrase et éclate en proies (moment clé à 2,98 s).' },
    { beat: 'Frôler', clip: 'near-miss', in: 0.8, out: 4.2, notes: 'Tête contre tête, ralenti au croisement.' },
    { beat: 'Carton', gap: 0.9, card: '40 IA. AUCUN SCRIPT.' },
    { beat: 'Le piège', clip: 'the-trap', in: 2.8, out: 6.5, notes: 'Le géant s\'enroule, la proie touche ses anneaux (moment clé à 3,98 s).' },
    { beat: 'Le petit contre le géant', clip: 'underdog', in: 0, out: 6.5, notes: 'Climax : le corail coupe la route du géant, qui se répand en champ de proies ; les charognards arrivent.' },
    { beat: 'L\'arène', clip: 'crowded-finale', in: 0, out: 3, notes: 'L\'arène grouille ; la caméra monte.' },
    { beat: 'Révélation', clip: 'arena-reveal', in: 4, out: 7.5, notes: 'Long zoom arrière jusqu\'à l\'arène entière.' },
    { beat: 'Titre', gap: 2, card: 'SNAKE.IO', notes: 'Carton titre (ajouter le logo au montage).' },
  ],
};
