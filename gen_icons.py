import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
CANVAS = 512  # se genera en alta resolución y se reescala para que quede nítido

BLUE = (66, 133, 244, 255)   # #4285F4 (Google Blue)
WHITE = (255, 255, 255, 255)

def rounded_square(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img

def draw_speaker_glyph(img, cx, cy, scale):
    """Dibuja el glifo de altavoz + ondas de sonido (estilo Material 'volume_up'),
    centrado en (cx, cy), sobre un icono virtual de 24x24 multiplicado por `scale`."""
    draw = ImageDraw.Draw(img)

    def p(x, y):
        # Convierte coordenadas del viewBox 24x24 (origen arriba-izq) a
        # coordenadas del canvas, centrando el glifo en (cx, cy).
        return (cx + (x - 12) * scale, cy + (y - 12) * scale)

    # Cuerpo del altavoz: hexágono equivalente al path
    # "M3 9 v6 h4 l5 5 V4 L7 9 H3 Z"
    cone_points = [p(3, 9), p(3, 15), p(7, 15), p(12, 20), p(12, 4), p(7, 9)]
    draw.polygon(cone_points, fill=WHITE)

    # Ondas de sonido: dos arcos concéntricos a la derecha del altavoz.
    wave_width = max(2, int(round(1.6 * scale)))
    for radius, span in ((5.0, 60), (8.2, 64)):
        bbox = [p(12 - radius, 12 - radius), p(12 + radius, 12 + radius)]
        draw.arc(bbox, start=-span, end=span, fill=WHITE, width=wave_width)

def make_master():
    radius = int(CANVAS * 0.22)
    img = rounded_square(CANVAS, radius, BLUE)
    draw_speaker_glyph(img, cx=CANVAS * 0.46, cy=CANVAS * 0.5, scale=CANVAS / 24 * 0.62)
    return img

def main():
    master = make_master()
    for size in (16, 32, 48, 128):
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(f"{OUT_DIR}/icon{size}.png")
        print(f"icon{size}.png OK")

if __name__ == "__main__":
    main()
