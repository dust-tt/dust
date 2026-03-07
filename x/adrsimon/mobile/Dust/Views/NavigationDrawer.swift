import SparkleTokens
import SwiftUI

struct NavigationDrawerContainer<Drawer: View, Content: View>: View {
    @Binding var isOpen: Bool
    let drawer: () -> Drawer
    let content: () -> Content

    private let drawerWidthRatio: CGFloat = 0.80
    private let contentCornerRadius: CGFloat = 20

    var body: some View {
        GeometryReader { geo in
            let drawerWidth = geo.size.width * drawerWidthRatio

            ZStack(alignment: .leading) {
                Color.dustBackground
                    .ignoresSafeArea()

                drawer()
                    .frame(width: drawerWidth, height: geo.size.height)

                content()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipShape(RoundedRectangle(cornerRadius: isOpen ? contentCornerRadius : 0))
                    .shadow(color: .black.opacity(isOpen ? 0.15 : 0), radius: 10, x: -4)
                    .offset(x: isOpen ? drawerWidth : 0)
                    .disabled(isOpen)
                    .onTapGesture {
                        if isOpen {
                            isOpen = false
                        }
                    }
            }
            .animation(.easeInOut(duration: 0.25), value: isOpen)
            .gesture(
                DragGesture()
                    .onEnded { value in
                        let threshold: CGFloat = 50
                        if value.translation.width > threshold, !isOpen {
                            isOpen = true
                        } else if value.translation.width < -threshold, isOpen {
                            isOpen = false
                        }
                    }
            )
        }
    }
}
