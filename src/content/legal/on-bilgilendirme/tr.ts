import type { LegalDocContent } from '@/lib/booking/documents';

/**
 * ÖN BİLGİLENDİRME FORMU — Türkçe (asıl metin).
 *
 * Bu dosya avukat onayı beklemektedir. Onaylı metin geldiğinde SADECE bu
 * dosyanın içeriği değiştirilecek ve DOCUMENT_VERSION yükseltilecektir.
 * Köşeli parantezler ([...]) şirket kuruluşu sonrası doldurulacaktır.
 */
export const onBilgilendirmeTr: LegalDocContent = {
  heading: 'Ön Bilgilendirme Formu',

  intro:
    'Bu form, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli ' +
    'Sözleşmeler Yönetmeliği uyarınca, ödeme yapmadan önce bilmeniz gereken ' +
    'hususları içerir. Rezervasyonunuza ait özet bilgiler bu formun ayrılmaz ' +
    'ekidir ve sayfanın altında yer alır.',

  tocTitle: 'İçindekiler',

  annexTitle: 'EK-1 — Rezervasyon Özeti',
  annexEmpty:
    'Rezervasyon özeti, tarih ve misafir bilgilerini girdikten sonra bu ' +
    'bölümde görüntülenir.',

  sections: [
    {
      id: 'satici',
      title: '1. Satıcı / Aracı Hizmet Sağlayıcı Bilgileri',
      body:
        'Unvan: [ŞİRKET UNVANI — kuruluş sonrası doldurulacaktır]\n\n' +
        'Adres: [ADRES]\nMERSİS No: [MERSİS]\nVergi Dairesi / No: [VERGİ]\n' +
        'E-posta: [DESTEK E-POSTA]\nTelefon: [TELEFON]\n\n' +
        'Homesta Stay, konaklama birimlerinin maliki değildir. Mülk sahibi ile ' +
        'misafir arasında aracılık eden bir aracı hizmet sağlayıcıdır. ' +
        'Konaklama hizmetinin fiilî ifasından mülk sahibi sorumludur.',
    },
    {
      id: 'hizmet',
      title: '2. Hizmetin Tanımı',
      body:
        'Hizmet, seçtiğiniz konaklama biriminde, belirttiğiniz giriş ve çıkış ' +
        'tarihleri arasında, belirttiğiniz misafir sayısı için kısa süreli ' +
        'konaklama hakkının sağlanmasıdır.\n\n' +
        'Konaklama birimine ilişkin nitelikler, kapasite ve olanaklar ilan ' +
        'sayfasında yer alır. Rezervasyon, yalnızca belirtilen tarihler için ' +
        'geçerlidir ve devredilemez.',
    },
    {
      id: 'bedel',
      title: '3. Bedel ve Ödeme Koşulları',
      body:
        'Toplam bedel, konaklanacak her gece için ayrı ayrı hesaplanan ' +
        'tutarların toplamıdır. Gecelik bir tutarın gece sayısı ile çarpımı ' +
        'değildir; sezonluk fiyatlar ve konaklama süresine bağlı indirimler ' +
        'gece bazında yansıtılır. Tüm vergiler dâhildir.\n\n' +
        'Fiyatlarımız ABD doları (USD) üzerinden belirlenir. Tahsilat, ödeme ' +
        'anında sabitlenen kur ile Türk lirası (TRY) olarak yapılır. ' +
        'Sabitlenen kur ve TRY tutarı ödeme ekranında açıkça gösterilir ve ' +
        'kartınızdan çekilecek tutar budur.\n\n' +
        'Ödeme, 3D Secure doğrulaması ile kredi veya banka kartı kullanılarak ' +
        'yapılır. Kart bilgileriniz tarafımızca saklanmaz.\n\n' +
        'Kartınız TRY dışında bir para biriminde ise, bankanızın uygulayacağı ' +
        'çevrim kuru ve masrafları bankanız ile aranızdadır ve tarafımızca ' +
        'belirlenmez.',
    },
    {
      id: 'onay',
      title: '4. Mülk Sahibi Onayı — 12 Saatlik Süre',
      body:
        'ÖNEMLİ: Ödemenizin alınması, rezervasyonun kesinleştiği anlamına ' +
        'gelmez. Ödeme alındıktan sonra rezervasyon talebiniz mülk sahibine ' +
        'iletilir.\n\n' +
        'Mülk sahibinin yanıt süresi en fazla 12 saattir. Bu süre içinde onay ' +
        'verilirse rezervasyonunuz kesinleşir ve tarafınıza onay e-postası ' +
        'gönderilir.\n\n' +
        'Mülk sahibi talebi reddederse veya 12 saat içinde yanıt vermezse, ' +
        'rezervasyon gerçekleşmemiş sayılır ve ödediğiniz tutarın tamamı ' +
        '5. ve 6. maddelerdeki koşullarla iade edilir. Bu durumda tarafınızdan ' +
        'herhangi bir kesinti yapılmaz.',
    },
    {
      id: 'cayma',
      title: '5. Cayma Hakkı ve İstisnası',
      body:
        'Mesafeli Sözleşmeler Yönetmeliği m.15/1-(g) uyarınca, belirli bir ' +
        'tarihte veya dönemde yapılması gereken konaklama, eşya taşıma, araba ' +
        'kiralama, yiyecek-içecek tedariki ve eğlence veya dinlenme amacıyla ' +
        'yapılan boş zamanın değerlendirilmesine ilişkin sözleşmelerde ' +
        'TÜKETİCİNİN CAYMA HAKKI BULUNMAMAKTADIR.\n\n' +
        'Rezervasyonunuz belirli giriş ve çıkış tarihlerine bağlı olduğundan ' +
        'bu istisna kapsamındadır. Bu husus, ödeme öncesinde açıkça kabul ' +
        'edilmektedir.\n\n' +
        'Bu istisna, mülk sahibinin onay vermemesi hâlindeki iade hakkınızı ' +
        'ETKİLEMEZ. Onaylanmayan bir rezervasyonda bedel her hâlükârda iade ' +
        'edilir.',
    },
    {
      id: 'iade',
      title: '6. İade Koşulları',
      body:
        'İade gereken hâllerde (mülk sahibinin reddi veya 12 saat içinde yanıt ' +
        'vermemesi), iade ödemenin yapıldığı karta yapılır. Başka bir karta ' +
        'veya hesaba iade yapılamaz.\n\n' +
        'İade tutarı, tahsil edilen Türk lirası tutarının aynısıdır. Ödeme ' +
        'anında sabitlenen kur esas alınır; iade tarihindeki kur farkı ' +
        'tarafınıza yansıtılmaz ve tarafımızca talep edilmez.\n\n' +
        'İade işlemi tarafımızca derhâl başlatılır. Tutarın kart hesabınıza ' +
        'yansıması, bankanızın işlem süresine bağlı olarak 3–10 iş günü ' +
        'sürebilir. Bu süre bankanızın kontrolündedir.\n\n' +
        'Kartınız TRY dışında bir para biriminde ise, çekim ve iade ' +
        'anlarındaki banka çevrim kurları farklı olabilir. Bu fark bankanız ' +
        'ile aranızda olup tarafımıza atfedilemez.',
    },
    {
      id: 'iptal',
      title: '7. Onaylanmış Rezervasyonun İptali',
      body:
        'Mülk sahibi tarafından onaylanmış bir rezervasyonun iptal koşulları, ' +
        'ilgili ilan sayfasında belirtilen iptal politikasına tabidir.\n\n' +
        'Mücbir sebep hâlleri ile mülk sahibinden kaynaklanan iptallerde ' +
        'ödediğiniz bedelin tamamı iade edilir.',
    },
    {
      id: 'sikayet',
      title: '8. Şikâyet ve Uyuşmazlık Çözümü',
      body:
        'Talep ve şikâyetlerinizi [DESTEK E-POSTA] adresine iletebilirsiniz.\n\n' +
        'Uyuşmazlık hâlinde, Ticaret Bakanlığınca her yıl belirlenen parasal ' +
        'sınırlar çerçevesinde, tüketicinin yerleşim yerindeki veya işlemin ' +
        'yapıldığı yerdeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri ' +
        'yetkilidir.',
    },
  ],
};
