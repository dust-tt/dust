import SparkleTokens
import SwiftUI

struct Avatar: View {
    let url: String?
    var size: CGFloat = 24

    var body: some View {
        AsyncImage(url: url.flatMap { URL(string: $0) }) { image in
            image
                .resizable()
                .aspectRatio(contentMode: .fill)
        } placeholder: {
            Circle()
                .fill(Color.dustFaint.opacity(0.3))
                .overlay {
                    Image(systemName: "person.fill")
                        .font(.system(size: size * 0.5))
                        .foregroundStyle(Color.dustFaint)
                }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }
}
