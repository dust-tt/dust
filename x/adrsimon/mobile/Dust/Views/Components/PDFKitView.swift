import PDFKit
import SwiftUI

struct PDFKitView: UIViewRepresentable {
    let data: Data

    func makeUIView(context _: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.autoScales = true
        pdfView.document = PDFDocument(data: data)
        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context _: Context) {
        if pdfView.document == nil {
            pdfView.document = PDFDocument(data: data)
        }
    }
}
