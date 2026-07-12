from PIL import Image

def remove_background(image_path, output_path):
    img = Image.open(image_path)
    img = img.convert("RGBA")
    datas = img.getdata()

    new_data = []
    for item in datas:
        # Check if the pixel is very close to white/light-grey
        # The background in the image seems to be around (240, 240, 240) to (255, 255, 255)
        if item[0] > 230 and item[1] > 230 and item[2] > 230:
            new_data.append((255, 255, 255, 0)) # transparent
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(output_path, "PNG")

remove_background('assets/images/logo.png', 'assets/images/logo.png')
print("Background removed")
