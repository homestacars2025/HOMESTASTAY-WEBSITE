import type { LegalDocContent } from '@/lib/booking/documents';
import { COMPANY } from '@/lib/config/company';

/**
 * MESAFELİ SATIŞ SÖZLEŞMESİ — Türkçe (asıl metin).
 *
 * Avukat onaylı metin. İçerik her değiştiğinde DOCUMENT_VERSION yükseltilmelidir.
 */
export const mesafeliSatisTr: LegalDocContent = {
  heading: 'Mesafeli Satış Sözleşmesi',

  intro:
    'İşbu sözleşme, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve ' +
    'Mesafeli Sözleşmeler Yönetmeliği hükümlerine tabi olup, ödeme ' +
    'işleminin tamamlanması ile taraflar arasında kurulmuş sayılır.',

  tocTitle: 'Maddeler',

  sections: [
    {
      id: 'taraflar',
      title: 'Madde 1 — Taraflar',
      body:
        'SATICI / ARACI HİZMET SAĞLAYICI\n' +
        `Unvan: ${COMPANY.legalName}\nAdres: ${COMPANY.address}\nMERSİS: ${COMPANY.mersis}\n` +
        `Ticaret Sicil No: ${COMPANY.tradeRegistryNo}\n` +
        `Vergi Dairesi / No: ${COMPANY.taxOffice} / ${COMPANY.taxNo}\n` +
        `E-posta: ${COMPANY.email}\nTelefon: ${COMPANY.phone}\n\n` +
        'ALICI\nRezervasyon sırasında beyan edilen ad, soyad, e-posta ve ' +
        'telefon bilgileri esas alınır. Bu bilgilerin doğruluğundan ALICI ' +
        'sorumludur.',
    },
    {
      id: 'konu',
      title: 'Madde 2 — Sözleşmenin Konusu',
      body:
        'İşbu sözleşmenin konusu, ALICI’nın elektronik ortamda seçtiği ' +
        'konaklama birimine ilişkin, belirtilen giriş ve çıkış tarihleri ' +
        'arasındaki konaklama hizmetinin sağlanması ile tarafların hak ve ' +
        'yükümlülüklerinin belirlenmesidir.\n\n' +
        'SATICI, konaklama biriminin maliki olmayıp mülk sahibi ile ALICI ' +
        'arasında aracılık etmektedir. Konaklama hizmetinin fiilî ifası mülk ' +
        'sahibinin sorumluluğundadır.',
    },
    {
      id: 'bedel',
      title: 'Madde 3 — Bedel ve Ödeme',
      body:
        'Toplam bedel, konaklanacak her gece için ayrı hesaplanan tutarların ' +
        'toplamı olup tüm vergiler dâhildir. Bedel ABD doları üzerinden ' +
        'belirlenir ve ödeme anında sabitlenen kur ile Türk lirası olarak ' +
        'tahsil edilir.\n\n' +
        'Sabitlenen kur ve tahsil edilecek TRY tutarı ödeme öncesinde ' +
        'ALICI’ya gösterilir. Ödeme, 3D Secure doğrulaması ile yapılır ve ' +
        'kart bilgileri SATICI tarafından saklanmaz.',
    },
    {
      id: 'onay',
      title: 'Madde 4 — Rezervasyonun Kesinleşmesi',
      body:
        'Ödemenin alınması rezervasyonun kesinleştiği anlamına gelmez. Ödeme ' +
        'sonrasında talep mülk sahibine iletilir ve mülk sahibinin en geç 12 ' +
        'saat içinde onay vermesi hâlinde rezervasyon kesinleşir.\n\n' +
        'Mülk sahibinin reddi veya 12 saat içinde yanıt vermemesi hâlinde ' +
        'sözleşme kurulmamış sayılır ve tahsil edilen bedelin tamamı Madde 6 ' +
        'uyarınca iade edilir.',
    },
    {
      id: 'cayma',
      title: 'Madde 5 — Cayma Hakkının Bulunmaması',
      body:
        'Mesafeli Sözleşmeler Yönetmeliği m.15/1-(g) uyarınca, belirli bir ' +
        'tarihte veya dönemde yapılması gereken konaklamaya ilişkin ' +
        'sözleşmelerde tüketicinin CAYMA HAKKI BULUNMAMAKTADIR. İşbu ' +
        'rezervasyon belirli tarihlere bağlı olduğundan bu istisna ' +
        'kapsamındadır ve ALICI bunu kabul eder.\n\n' +
        'Bu madde, Madde 4 uyarınca onaylanmayan rezervasyonlarda ALICI’nın ' +
        'iade hakkını ortadan kaldırmaz.',
    },
    {
      id: 'iade',
      title: 'Madde 6 — İade',
      body:
        'İade, ödemenin yapıldığı karta ve tahsil edilen Türk lirası tutarının ' +
        'aynısı olarak yapılır. İade tarihindeki kur farkı taraflarca talep ' +
        'edilemez.\n\n' +
        'İade SATICI tarafından derhâl başlatılır; tutarın karta yansıması ' +
        'bankanın işlem süresine bağlı olarak 3–10 iş günü sürebilir. ' +
        'Yabancı para birimli kartlarda bankanın uyguladığı çevrim farkları ' +
        'ALICI ile bankası arasındadır.',
    },
    {
      id: 'yukumluluk',
      title: 'Madde 7 — Genel Hükümler',
      body:
        'ALICI, konaklama biriminin ilanda belirtilen kurallarına ve mülk ' +
        'sahibinin makul talimatlarına uymayı kabul eder.\n\n' +
        'ALICI, beyan ettiği misafir sayısını aşmayacağını kabul eder. ' +
        'Gerçeğe aykırı beyan hâlinde mülk sahibinin girişi reddetme hakkı ' +
        'saklıdır.\n\n' +
        'Mücbir sebep hâllerinde tarafların yükümlülükleri, ifanın imkânsız ' +
        'hâle geldiği ölçüde askıya alınır ve tahsil edilen bedel iade edilir.',
    },
    {
      id: 'delil',
      title: 'Madde 8 — Bilgilendirme, Delil ve Kayıtlar',
      body:
        'İşbu sözleşme ve Ön Bilgilendirme Formu, ödeme öncesinde ALICI’ya ' +
        'elektronik ortamda sunulmuş ve ALICI tarafından okunup kabul ' +
        'edilmiştir. Kabul kaydı; tarih, saat, belge sürümü ve IP adresi ile ' +
        'birlikte saklanır.\n\n' +
        'Her iki belge, ödeme sonrasında ALICI’nın beyan ettiği e-posta ' +
        'adresine PDF biçiminde ayrıca gönderilir.\n\n' +
        'Taraflar, SATICI’nın elektronik kayıtlarının 6100 sayılı Hukuk ' +
        'Muhakemeleri Kanunu m.193 anlamında kesin delil niteliğinde ' +
        'olduğunu kabul eder.',
    },
    {
      id: 'yururluk',
      title: 'Madde 9 — Yürürlük',
      body:
        'İşbu sözleşme, ALICI tarafından elektronik ortamda kabul edilmesi ve ' +
        'ödeme işleminin tamamlanması ile yürürlüğe girer.\n\n' +
        'Uyuşmazlık hâlinde, Ticaret Bakanlığınca ilan edilen parasal sınırlar ' +
        'çerçevesinde Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri ' +
        'yetkilidir.',
    },
  ],
};
