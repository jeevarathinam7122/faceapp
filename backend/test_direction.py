import asyncio
import sys
import face_utils

async def main(image_path, angle):
    print(f"Testing validation for angle '{angle}' on image: {image_path}")
    
    with open(image_path, "rb") as f:
        image_bytes = f.read()

    image_np = face_utils.load_image_file(image_bytes)

    print("\n--- Testing Without Mirroring ---")
    is_valid_dir = face_utils.validate_face_direction(image_np, angle, is_mirrored=False)
    print(f"Validates as {angle} (Not Mirrored)? {is_valid_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_direction.py <image_path> <angle>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
