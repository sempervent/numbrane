"""Gallery command implementation."""

from pathlib import Path

import typer

from numbrane_python.cli.utils import get_console, print_error, print_success

gallery_app = typer.Typer(name="gallery", help="Generate HTML galleries")


@gallery_app.command()
def gallery(
    input_dir: Path = typer.Argument(..., help="Input directory with images"),
    output: Path = typer.Option("gallery.html", "--output", "-o", help="Output HTML file"),
):
    """Generate HTML gallery from rendered images."""
    console = get_console()

    input_dir = Path(input_dir)
    if not input_dir.exists():
        print_error(f"Directory {input_dir} does not exist.")
        raise typer.Exit(1)

    # Find all images
    images = []
    for ext in ["*.png", "*.jpg", "*.jpeg"]:
        images.extend(input_dir.glob(ext))
        images.extend((input_dir / "thumbs").glob(ext))

    images = sorted(set(images))

    if not images:
        print_error(f"No images found in {input_dir}")
        raise typer.Exit(1)

    # Generate HTML
    html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Generative Art Gallery</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #1a1a1a;
            color: #fff;
            padding: 20px;
        }}
        .header {{
            margin-bottom: 30px;
        }}
        .header h1 {{
            font-size: 2.5em;
            margin-bottom: 10px;
        }}
        .header p {{
            color: #aaa;
            font-size: 1.1em;
        }}
        .gallery {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }}
        .item {{
            background: #2a2a2a;
            padding: 15px;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
            cursor: pointer;
        }}
        .item:hover {{
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }}
        .item img {{
            width: 100%;
            height: auto;
            border-radius: 4px;
            display: block;
        }}
        .item .name {{
            margin-top: 10px;
            font-size: 0.9em;
            color: #aaa;
            word-break: break-all;
        }}
        .modal {{
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
        }}
        .modal-content {{
            margin: auto;
            display: block;
            max-width: 90%;
            max-height: 90%;
            margin-top: 50px;
        }}
        .close {{
            position: absolute;
            top: 15px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }}
        .close:hover {{
            color: #bbb;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Generative Art Gallery</h1>
        <p>Found {len(images)} images</p>
    </div>
    <div class="gallery">
"""

    for img_path in images:
        rel_path = img_path.relative_to(input_dir)
        html += f"""        <div class="item" onclick="openModal('{rel_path}')">
            <img src="{rel_path}" alt="{img_path.name}" loading="lazy">
            <div class="name">{img_path.name}</div>
        </div>
"""

    html += """    </div>
    <div id="modal" class="modal">
        <span class="close" onclick="closeModal()">&times;</span>
        <img class="modal-content" id="modalImg">
    </div>
    <script>
        function openModal(src) {
            const modal = document.getElementById('modal');
            const modalImg = document.getElementById('modalImg');
            modal.style.display = 'block';
            modalImg.src = src;
        }
        function closeModal() {
            document.getElementById('modal').style.display = 'none';
        }
        window.onclick = function(event) {
            const modal = document.getElementById('modal');
            if (event.target == modal) {
                modal.style.display = 'none';
            }
        }
    </script>
</body>
</html>
"""

    output_path = Path(output)
    with open(output_path, "w") as f:
        f.write(html)

    print_success(f"Gallery saved to {output_path}")
    console.print(f"[dim]Open {output_path} in your browser to view[/dim]")
