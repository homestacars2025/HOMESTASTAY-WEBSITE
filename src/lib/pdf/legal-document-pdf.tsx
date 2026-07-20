import path from 'node:path';
import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';
import type { LegalDocContent } from '@/lib/booking/documents';

/**
 * A distance-selling document rendered to PDF for the confirmation email
 * (Mesafeli Satış Sözleşmesi Madde 8 requires both documents attached).
 *
 * FONT: Geist, embedded from vendored static TTFs in ./fonts. The base-14 PDF
 * fonts do not cover ş ğ ı İ ç ö ü, so a Turkish legal document rendered with
 * them is mojibake. Geist covers Turkish in full (verified against the glyph
 * table) — but NOT the ₺ symbol, which is why money is formatted as "… TL"
 * text here, never with the currency glyph.
 *
 * The fonts are read by absolute path at module load. next.config's
 * outputFileTracingIncludes ships them into the callback function's bundle;
 * without that entry they are absent at runtime on Vercel.
 */

const FONT_DIR = path.join(process.cwd(), 'src/lib/pdf/fonts');

Font.register({
  family: 'Geist',
  fonts: [
    { src: path.join(FONT_DIR, 'Geist-Regular.ttf'),  fontWeight: 400 },
    { src: path.join(FONT_DIR, 'Geist-Medium.ttf'),   fontWeight: 500 },
    { src: path.join(FONT_DIR, 'Geist-SemiBold.ttf'), fontWeight: 600 },
  ],
});

// A blank line inside a legal clause should not be a widow-prone page break.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Geist',
    fontSize: 9.5,
    lineHeight: 1.5,
    color: '#1B1B1F',
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
  },
  heading: { fontSize: 18, fontWeight: 600, color: '#0E0E10', marginBottom: 6 },
  version: { fontSize: 7.5, color: '#8C8881', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  intro: { fontSize: 10, color: '#45454B', marginBottom: 18, lineHeight: 1.55 },
  sectionTitle: { fontSize: 10.5, fontWeight: 600, color: '#0E0E10', marginTop: 14, marginBottom: 5 },
  para: { color: '#45454B', marginBottom: 5 },
  annexBox: { marginTop: 8, borderWidth: 1, borderColor: '#E2DED4', borderStyle: 'solid', borderRadius: 6, padding: 12 },
  annexRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  annexLabel: { color: '#8C8881' },
  annexValue: { color: '#0E0E10', fontWeight: 500 },
  footer: {
    position: 'absolute', bottom: 28, left: 48, right: 48,
    fontSize: 7.5, color: '#8C8881',
    borderTopWidth: 1, borderTopColor: '#E2DED4', borderTopStyle: 'solid',
    paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between',
  },
});

export interface LegalAnnexRow {
  label: string;
  value: string;
}

interface LegalDocumentPdfProps {
  content:      LegalDocContent;
  version:      string;
  versionLabel: string;
  footerNote:   string;
  /** Booking summary — the Ön Bilgilendirme Formu's legal annex. */
  annex?:       LegalAnnexRow[];
}

export function LegalDocumentPdf({
  content, version, versionLabel, footerNote, annex,
}: LegalDocumentPdfProps) {
  return (
    <Document title={content.heading} author="Homesta Stay">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.heading}>{content.heading}</Text>
        <Text style={styles.version}>{versionLabel}: {version}</Text>
        <Text style={styles.intro}>{content.intro}</Text>

        {content.sections.map((s) => (
          <View key={s.id} wrap={false}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            {s.body.split('\n\n').map((para, i) => (
              <Text key={i} style={styles.para}>{para}</Text>
            ))}
          </View>
        ))}

        {annex && annex.length > 0 && (
          <View wrap={false} style={{ marginTop: 14 }}>
            {content.annexTitle && (
              <Text style={styles.sectionTitle}>{content.annexTitle}</Text>
            )}
            <View style={styles.annexBox}>
              {annex.map((row, i) => (
                <View key={i} style={styles.annexRow}>
                  <Text style={styles.annexLabel}>{row.label}</Text>
                  <Text style={styles.annexValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>{footerNote}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
