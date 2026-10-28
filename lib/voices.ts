// The scholars Ask can answer as, in the Commentary pop-up.
//
// Their names, their dates, and the short life shown under the About pill —
// written here by hand rather than generated, because it is the one thing in
// the Ask box that is offered as fact. How each one wrote and what he believed,
// as the model is told it, is in lib/voicePrompts.ts, which the server alone
// reads. Two of them are in the app in their own words: Matthew Henry on every
// book, and Spurgeon on the Psalms. When the reader is looking at one of
// those, what he actually wrote goes with the question and the answer is
// drawn from it. The rest answer from what is known of their writings.

export const VOICES = [
  {
    id: "henry",
    name: { en: "Matthew Henry", es: "Matthew Henry" },
    short: { en: "Henry", es: "Henry" },
    years: "1662–1714",
    bio: {
      en: "A Welsh-born Presbyterian minister who served congregations in Chester and Hackney. His Exposition of the Old and New Testaments, a devotional commentary on the whole Bible, was finished after his death by other ministers working from his notes, and has been in print ever since. The app carries its Concise Commentary, an abridgement.",
      es: "Ministro presbiteriano nacido en Gales que sirvió a congregaciones en Chester y Hackney. Su Exposición del Antiguo y el Nuevo Testamento, un comentario devocional de toda la Biblia, fue terminada tras su muerte por otros ministros a partir de sus notas, y se ha seguido imprimiendo desde entonces. La app incluye su Comentario conciso, una versión abreviada.",
    },
  },
  {
    id: "spurgeon",
    name: { en: "Charles Spurgeon", es: "Charles Spurgeon" },
    short: { en: "Spurgeon", es: "Spurgeon" },
    years: "1834–1892",
    bio: {
      en: "An English Baptist preacher, called the Prince of Preachers, who led the Metropolitan Tabernacle in London, where thousands heard him each week; his sermons were printed and read around the world. The Treasury of David, his commentary on the Psalms, took him some twenty years.",
      es: "Predicador bautista inglés, llamado el Príncipe de los Predicadores, que dirigió el Tabernáculo Metropolitano de Londres, donde miles lo escuchaban cada semana; sus sermones se imprimían y leían en todo el mundo. El Tesoro de David, su comentario de los Salmos, le llevó unos veinte años.",
    },
  },
  {
    id: "calvin",
    name: { en: "John Calvin", es: "Juan Calvino" },
    short: { en: "Calvin", es: "Calvino" },
    years: "1509–1564",
    bio: {
      en: "A French theologian and pastor who led the Reformation in Geneva. His Institutes of the Christian Religion and his commentaries on most books of the Bible shaped the Reformed and Presbyterian churches.",
      es: "Teólogo y pastor francés que dirigió la Reforma en Ginebra. Su Institución de la religión cristiana y sus comentarios de la mayoría de los libros de la Biblia formaron las iglesias reformadas y presbiterianas.",
    },
  },
  {
    id: "luther",
    name: { en: "Martin Luther", es: "Martín Lutero" },
    short: { en: "Luther", es: "Lutero" },
    years: "1483–1546",
    bio: {
      en: "A German monk and professor at Wittenberg whose Ninety-five Theses of 1517 began the Protestant Reformation. He taught that we are made right with God by grace, through faith alone, and translated the Bible into German.",
      es: "Monje alemán y profesor en Wittenberg cuyas Noventa y cinco tesis de 1517 dieron comienzo a la Reforma protestante. Enseñó que somos justificados ante Dios por gracia, solo por la fe, y tradujo la Biblia al alemán.",
    },
  },
  {
    id: "wesley",
    name: { en: "John Wesley", es: "John Wesley" },
    short: { en: "Wesley", es: "Wesley" },
    years: "1703–1791",
    bio: {
      en: "An Anglican priest and evangelist who, with his brother Charles, led the revival that became Methodism. He travelled the country on horseback preaching in the open air, and his sermons and Explanatory Notes upon the New Testament shaped Methodist teaching.",
      es: "Sacerdote anglicano y evangelista que, con su hermano Charles, encabezó el avivamiento del que nació el metodismo. Recorrió el país a caballo predicando al aire libre, y sus sermones y sus Notas explicativas sobre el Nuevo Testamento dieron forma a la enseñanza metodista.",
    },
  },
  {
    id: "augustine",
    name: { en: "Augustine", es: "Agustín" },
    short: { en: "Augustine", es: "Agustín" },
    years: "354–430",
    bio: {
      en: "A bishop of Hippo in North Africa. His Confessions tell the story of his conversion, and The City of God and his sermons on the Psalms and the Gospel of John made him one of the most influential teachers of the Western church.",
      es: "Obispo de Hipona, en el norte de África. Sus Confesiones cuentan su conversión, y La ciudad de Dios y sus sermones sobre los Salmos y el Evangelio de Juan lo hicieron uno de los maestros más influyentes de la iglesia occidental.",
    },
  },
  {
    id: "chrysostom",
    name: { en: "John Chrysostom", es: "Juan Crisóstomo" },
    short: { en: "Chrysostom", es: "Crisóstomo" },
    years: "c. 347–407",
    bio: {
      en: "A preacher at Antioch who became Archbishop of Constantinople, called Chrysostom, “golden-mouthed”, for his sermons. His homilies on Matthew, John and the letters of Paul are still read in the churches of East and West. He died in exile.",
      es: "Predicador en Antioquía que llegó a ser arzobispo de Constantinopla, llamado Crisóstomo, «boca de oro», por sus sermones. Sus homilías sobre Mateo, Juan y las cartas de Pablo se siguen leyendo en las iglesias de Oriente y Occidente. Murió en el destierro.",
    },
  },
] as const;

export type VoiceId = (typeof VOICES)[number]["id"];

export function isVoice(id: unknown): id is VoiceId {
  return VOICES.some((v) => v.id === id);
}

export function voiceOf(id: VoiceId) {
  return VOICES.find((v) => v.id === id)!;
}

/** The ones whose own commentary the app carries, and can send along. */
export const HAS_SOURCE: readonly VoiceId[] = ["henry", "spurgeon"];
