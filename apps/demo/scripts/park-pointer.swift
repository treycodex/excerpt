// Moves the pointer to the bottom-right corner so a take never shows it.
import CoreGraphics
let bounds = CGDisplayBounds(CGMainDisplayID())
CGWarpMouseCursorPosition(CGPoint(x: bounds.maxX - 2, y: bounds.maxY - 2))
CGAssociateMouseAndMouseCursorPosition(1)
