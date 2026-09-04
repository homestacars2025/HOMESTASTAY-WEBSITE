// turkey.ts — Turkish provinces (81) + Istanbul districts (39)
// `value` is a stable Latin ASCII key: this is what gets STORED and SENT to the
// Edge Function (residence_city / residence_district). ar/tr/en/ru are display only.
// Istanbul's value is exactly "Istanbul" (no İ) — the district dropdown shows only
// when residence_city === "Istanbul".

export type GeoOption = {
  value: string;
  ar: string;
  tr: string;
  en: string;
  ru: string;
};

export type AppLocale = "ar" | "tr" | "en" | "ru";

/** The value stored for Istanbul, used to gate the district dropdown. */
export const ISTANBUL_VALUE = "Istanbul";

export const TURKEY_PROVINCES: GeoOption[] = [
  { value: "Adana", ar: "أضنة", tr: "Adana", en: "Adana", ru: "Адана" },
  { value: "Adiyaman", ar: "أديامان", tr: "Adıyaman", en: "Adiyaman", ru: "Адыяман" },
  { value: "Afyonkarahisar", ar: "أفيون قره حصار", tr: "Afyonkarahisar", en: "Afyonkarahisar", ru: "Афьонкарахисар" },
  { value: "Agri", ar: "آغري", tr: "Ağrı", en: "Agri", ru: "Агры" },
  { value: "Aksaray", ar: "أق سراي", tr: "Aksaray", en: "Aksaray", ru: "Аксарай" },
  { value: "Amasya", ar: "أماسيا", tr: "Amasya", en: "Amasya", ru: "Амасья" },
  { value: "Ankara", ar: "أنقرة", tr: "Ankara", en: "Ankara", ru: "Анкара" },
  { value: "Antalya", ar: "أنطاليا", tr: "Antalya", en: "Antalya", ru: "Анталья" },
  { value: "Ardahan", ar: "أردهان", tr: "Ardahan", en: "Ardahan", ru: "Ардахан" },
  { value: "Artvin", ar: "أرتفين", tr: "Artvin", en: "Artvin", ru: "Артвин" },
  { value: "Aydin", ar: "آيدن", tr: "Aydın", en: "Aydin", ru: "Айдын" },
  { value: "Balikesir", ar: "بالِك أسير", tr: "Balıkesir", en: "Balikesir", ru: "Балыкесир" },
  { value: "Bartin", ar: "بارتن", tr: "Bartın", en: "Bartin", ru: "Бартын" },
  { value: "Batman", ar: "باطمان", tr: "Batman", en: "Batman", ru: "Батман" },
  { value: "Bayburt", ar: "بايبورت", tr: "Bayburt", en: "Bayburt", ru: "Байбурт" },
  { value: "Bilecik", ar: "بيلجيك", tr: "Bilecik", en: "Bilecik", ru: "Биледжик" },
  { value: "Bingol", ar: "بينغول", tr: "Bingöl", en: "Bingol", ru: "Бингёль" },
  { value: "Bitlis", ar: "بتليس", tr: "Bitlis", en: "Bitlis", ru: "Битлис" },
  { value: "Bolu", ar: "بولو", tr: "Bolu", en: "Bolu", ru: "Болу" },
  { value: "Burdur", ar: "بوردور", tr: "Burdur", en: "Burdur", ru: "Бурдур" },
  { value: "Bursa", ar: "بورصة", tr: "Bursa", en: "Bursa", ru: "Бурса" },
  { value: "Canakkale", ar: "تشاناك قلعة", tr: "Çanakkale", en: "Canakkale", ru: "Чанаккале" },
  { value: "Cankiri", ar: "تشانكري", tr: "Çankırı", en: "Cankiri", ru: "Чанкыры" },
  { value: "Corum", ar: "تشوروم", tr: "Çorum", en: "Corum", ru: "Чорум" },
  { value: "Denizli", ar: "دنيزلي", tr: "Denizli", en: "Denizli", ru: "Денизли" },
  { value: "Diyarbakir", ar: "ديار بكر", tr: "Diyarbakır", en: "Diyarbakir", ru: "Диярбакыр" },
  { value: "Duzce", ar: "دوزجة", tr: "Düzce", en: "Duzce", ru: "Дюздже" },
  { value: "Edirne", ar: "أدرنة", tr: "Edirne", en: "Edirne", ru: "Эдирне" },
  { value: "Elazig", ar: "إيلازِغ", tr: "Elazığ", en: "Elazig", ru: "Элязыг" },
  { value: "Erzincan", ar: "أرزنجان", tr: "Erzincan", en: "Erzincan", ru: "Эрзинджан" },
  { value: "Erzurum", ar: "أرضروم", tr: "Erzurum", en: "Erzurum", ru: "Эрзурум" },
  { value: "Eskisehir", ar: "إسكي شهير", tr: "Eskişehir", en: "Eskisehir", ru: "Эскишехир" },
  { value: "Gaziantep", ar: "غازي عنتاب", tr: "Gaziantep", en: "Gaziantep", ru: "Газиантеп" },
  { value: "Giresun", ar: "غيرسون", tr: "Giresun", en: "Giresun", ru: "Гиресун" },
  { value: "Gumushane", ar: "غوموش هانه", tr: "Gümüşhane", en: "Gumushane", ru: "Гюмюшхане" },
  { value: "Hakkari", ar: "هكاري", tr: "Hakkâri", en: "Hakkari", ru: "Хаккяри" },
  { value: "Hatay", ar: "هطاي", tr: "Hatay", en: "Hatay", ru: "Хатай" },
  { value: "Igdir", ar: "إغدير", tr: "Iğdır", en: "Igdir", ru: "Ыгдыр" },
  { value: "Isparta", ar: "إسبرطة", tr: "Isparta", en: "Isparta", ru: "Ыспарта" },
  { value: "Istanbul", ar: "إسطنبول", tr: "İstanbul", en: "Istanbul", ru: "Стамбул" },
  { value: "Izmir", ar: "إزمير", tr: "İzmir", en: "Izmir", ru: "Измир" },
  { value: "Kahramanmaras", ar: "قهرمان مرعش", tr: "Kahramanmaraş", en: "Kahramanmaras", ru: "Кахраманмараш" },
  { value: "Karabuk", ar: "قره بوك", tr: "Karabük", en: "Karabuk", ru: "Карабюк" },
  { value: "Karaman", ar: "قرمان", tr: "Karaman", en: "Karaman", ru: "Караман" },
  { value: "Kars", ar: "قارص", tr: "Kars", en: "Kars", ru: "Карс" },
  { value: "Kastamonu", ar: "قسطموني", tr: "Kastamonu", en: "Kastamonu", ru: "Кастамону" },
  { value: "Kayseri", ar: "قيصري", tr: "Kayseri", en: "Kayseri", ru: "Кайсери" },
  { value: "Kilis", ar: "كِلّس", tr: "Kilis", en: "Kilis", ru: "Килис" },
  { value: "Kirikkale", ar: "قِرِق قلعة", tr: "Kırıkkale", en: "Kirikkale", ru: "Кырыккале" },
  { value: "Kirklareli", ar: "قِرق لارلي", tr: "Kırklareli", en: "Kirklareli", ru: "Кыркларели" },
  { value: "Kirsehir", ar: "قِرشهير", tr: "Kırşehir", en: "Kirsehir", ru: "Кыршехир" },
  { value: "Kocaeli", ar: "قوجه إيلي", tr: "Kocaeli", en: "Kocaeli", ru: "Коджаэли" },
  { value: "Konya", ar: "قونية", tr: "Konya", en: "Konya", ru: "Конья" },
  { value: "Kutahya", ar: "كوتاهية", tr: "Kütahya", en: "Kutahya", ru: "Кютахья" },
  { value: "Malatya", ar: "ملطية", tr: "Malatya", en: "Malatya", ru: "Малатья" },
  { value: "Manisa", ar: "مانيسا", tr: "Manisa", en: "Manisa", ru: "Маниса" },
  { value: "Mardin", ar: "ماردين", tr: "Mardin", en: "Mardin", ru: "Мардин" },
  { value: "Mersin", ar: "مرسين", tr: "Mersin", en: "Mersin", ru: "Мерсин" },
  { value: "Mugla", ar: "موغلا", tr: "Muğla", en: "Mugla", ru: "Мугла" },
  { value: "Mus", ar: "موش", tr: "Muş", en: "Mus", ru: "Муш" },
  { value: "Nevsehir", ar: "نوشهير", tr: "Nevşehir", en: "Nevsehir", ru: "Невшехир" },
  { value: "Nigde", ar: "نيغدة", tr: "Niğde", en: "Nigde", ru: "Нигде" },
  { value: "Ordu", ar: "أوردو", tr: "Ordu", en: "Ordu", ru: "Орду" },
  { value: "Osmaniye", ar: "عثمانية", tr: "Osmaniye", en: "Osmaniye", ru: "Османие" },
  { value: "Rize", ar: "ريزة", tr: "Rize", en: "Rize", ru: "Ризе" },
  { value: "Sakarya", ar: "سقاريا", tr: "Sakarya", en: "Sakarya", ru: "Сакарья" },
  { value: "Samsun", ar: "سامسون", tr: "Samsun", en: "Samsun", ru: "Самсун" },
  { value: "Sanliurfa", ar: "شانلي أورفا", tr: "Şanlıurfa", en: "Sanliurfa", ru: "Шанлыурфа" },
  { value: "Siirt", ar: "سعرت", tr: "Siirt", en: "Siirt", ru: "Сиирт" },
  { value: "Sinop", ar: "سينوب", tr: "Sinop", en: "Sinop", ru: "Синоп" },
  { value: "Sivas", ar: "سيواس", tr: "Sivas", en: "Sivas", ru: "Сивас" },
  { value: "Sirnak", ar: "شرناق", tr: "Şırnak", en: "Sirnak", ru: "Ширнак" },
  { value: "Tekirdag", ar: "تكيرداغ", tr: "Tekirdağ", en: "Tekirdag", ru: "Текирдаг" },
  { value: "Tokat", ar: "توقات", tr: "Tokat", en: "Tokat", ru: "Токат" },
  { value: "Trabzon", ar: "طرابزون", tr: "Trabzon", en: "Trabzon", ru: "Трабзон" },
  { value: "Tunceli", ar: "تونجلي", tr: "Tunceli", en: "Tunceli", ru: "Тунджели" },
  { value: "Usak", ar: "أوشاق", tr: "Uşak", en: "Usak", ru: "Ушак" },
  { value: "Van", ar: "وان", tr: "Van", en: "Van", ru: "Ван" },
  { value: "Yalova", ar: "يالوفا", tr: "Yalova", en: "Yalova", ru: "Ялова" },
  { value: "Yozgat", ar: "يوزغات", tr: "Yozgat", en: "Yozgat", ru: "Йозгат" },
  { value: "Zonguldak", ar: "زونغولداق", tr: "Zonguldak", en: "Zonguldak", ru: "Зонгулдак" },
];

export const ISTANBUL_DISTRICTS: GeoOption[] = [
  { value: "Adalar", ar: "الجزر", tr: "Adalar", en: "Adalar", ru: "Адалар" },
  { value: "Arnavutkoy", ar: "أرناووت كوي", tr: "Arnavutköy", en: "Arnavutkoy", ru: "Арнавуткёй" },
  { value: "Atasehir", ar: "آتا شهير", tr: "Ataşehir", en: "Atasehir", ru: "Аташехир" },
  { value: "Avcilar", ar: "آفجلار", tr: "Avcılar", en: "Avcilar", ru: "Авджылар" },
  { value: "Bagcilar", ar: "باغجلار", tr: "Bağcılar", en: "Bagcilar", ru: "Багджылар" },
  { value: "Bahcelievler", ar: "باهتشلي إفلر", tr: "Bahçelievler", en: "Bahcelievler", ru: "Бахчелиэвлер" },
  { value: "Bakirkoy", ar: "باكِر كوي", tr: "Bakırköy", en: "Bakirkoy", ru: "Бакыркёй" },
  { value: "Basaksehir", ar: "باشاك شهير", tr: "Başakşehir", en: "Basaksehir", ru: "Башакшехир" },
  { value: "Bayrampasa", ar: "بيرام باشا", tr: "Bayrampaşa", en: "Bayrampasa", ru: "Байрампаша" },
  { value: "Besiktas", ar: "بشيكتاش", tr: "Beşiktaş", en: "Besiktas", ru: "Бешикташ" },
  { value: "Beykoz", ar: "بي كوز", tr: "Beykoz", en: "Beykoz", ru: "Бейкоз" },
  { value: "Beylikduzu", ar: "بيلِك دوزو", tr: "Beylikdüzü", en: "Beylikduzu", ru: "Бейликдюзю" },
  { value: "Beyoglu", ar: "بي أوغلو", tr: "Beyoğlu", en: "Beyoglu", ru: "Бейоглу" },
  { value: "Buyukcekmece", ar: "بيوك تشكمجة", tr: "Büyükçekmece", en: "Buyukcekmece", ru: "Бююкчекмедже" },
  { value: "Catalca", ar: "تشاتالجا", tr: "Çatalca", en: "Catalca", ru: "Чаталджа" },
  { value: "Cekmekoy", ar: "تشكمه كوي", tr: "Çekmeköy", en: "Cekmekoy", ru: "Чекмекёй" },
  { value: "Esenler", ar: "إسنلر", tr: "Esenler", en: "Esenler", ru: "Эсенлер" },
  { value: "Esenyurt", ar: "إسن يورت", tr: "Esenyurt", en: "Esenyurt", ru: "Эсеньюрт" },
  { value: "Eyupsultan", ar: "أيوب سلطان", tr: "Eyüpsultan", en: "Eyupsultan", ru: "Эюпсултан" },
  { value: "Fatih", ar: "الفاتح", tr: "Fatih", en: "Fatih", ru: "Фатих" },
  { value: "Gaziosmanpasa", ar: "غازي عثمان باشا", tr: "Gaziosmanpaşa", en: "Gaziosmanpasa", ru: "Газиосманпаша" },
  { value: "Gungoren", ar: "غونغورن", tr: "Güngören", en: "Gungoren", ru: "Гюнгёрен" },
  { value: "Kadikoy", ar: "كادي كوي", tr: "Kadıköy", en: "Kadikoy", ru: "Кадыкёй" },
  { value: "Kagithane", ar: "كاغيت هانه", tr: "Kâğıthane", en: "Kagithane", ru: "Кагытхане" },
  { value: "Kartal", ar: "كارطال", tr: "Kartal", en: "Kartal", ru: "Картал" },
  { value: "Kucukcekmece", ar: "كوتشوك تشكمجة", tr: "Küçükçekmece", en: "Kucukcekmece", ru: "Кючюкчекмедже" },
  { value: "Maltepe", ar: "مالتبه", tr: "Maltepe", en: "Maltepe", ru: "Мальтепе" },
  { value: "Pendik", ar: "بنديك", tr: "Pendik", en: "Pendik", ru: "Пендик" },
  { value: "Sancaktepe", ar: "سانجاك تبه", tr: "Sancaktepe", en: "Sancaktepe", ru: "Санджактепе" },
  { value: "Sariyer", ar: "ساريير", tr: "Sarıyer", en: "Sariyer", ru: "Сарыер" },
  { value: "Sile", ar: "شيلة", tr: "Şile", en: "Sile", ru: "Шиле" },
  { value: "Silivri", ar: "سيليوري", tr: "Silivri", en: "Silivri", ru: "Силиври" },
  { value: "Sisli", ar: "شيشلي", tr: "Şişli", en: "Sisli", ru: "Шишли" },
  { value: "Sultanbeyli", ar: "سلطان بيلي", tr: "Sultanbeyli", en: "Sultanbeyli", ru: "Султанбейли" },
  { value: "Sultangazi", ar: "سلطان غازي", tr: "Sultangazi", en: "Sultangazi", ru: "Султангази" },
  { value: "Tuzla", ar: "توزلا", tr: "Tuzla", en: "Tuzla", ru: "Тузла" },
  { value: "Umraniye", ar: "أومرانية", tr: "Ümraniye", en: "Umraniye", ru: "Умрание" },
  { value: "Uskudar", ar: "أسكودار", tr: "Üsküdar", en: "Uskudar", ru: "Ускюдар" },
  { value: "Zeytinburnu", ar: "زيتين بورنو", tr: "Zeytinburnu", en: "Zeytinburnu", ru: "Зейтинбурну" },
];

/** Localized label for an option, falling back en → value. */
export function geoLabel(opt: GeoOption, locale: AppLocale): string {
  return opt[locale] || opt.en || opt.value;
}

/** Districts to show for a given city value (empty unless Istanbul). */
export function districtsFor(cityValue: string | null | undefined): GeoOption[] {
  return cityValue === ISTANBUL_VALUE ? ISTANBUL_DISTRICTS : [];
}
