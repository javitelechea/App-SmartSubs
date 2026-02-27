import re
import sys

def fix_html_spacing(filepath):
    print(f"Reading {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix space after opening bracket: `< div` -> `<div`
    # Match `< ` followed by one or more spaces, then valid tag chars
    content = re.sub(r'<\s+([a-zA-Z!/]+)', r'<\1', content)

    # 2. Fix space before closing bracket: `div >` -> `div>`
    # Target common ones explicitly to avoid messing up JS `=>` or ` > ` logic
    # We'll specifically target closing parts of HTML tags that are strings
    tag_ends = ['div', 'span', 'button', 'b', 'i', 'td', 'tr', 'th', 'thead', 'tbody', 'table', 'style', 'p', 'h2', 'h3', 'h4', 'label', 'input']
    
    # Specific targeted replacements for exact known bad strings from user's report
    content = content.replace('< b >', '<b>')
    content = content.replace('</ b >', '</b>')
    content = content.replace('</b >', '</b>')
    
    content = content.replace('</div >', '</div>')
    content = content.replace('</span >', '</span>')
    content = content.replace('</button >', '</button>')
    content = content.replace('</td >', '</td>')
    content = content.replace('</tr >', '</tr>')
    content = content.replace('</th >', '</th>')
    content = content.replace('</style >', '</style>')
    content = content.replace('</p >', '</p>')
    content = content.replace('</h4 >', '</h4>')
    content = content.replace('</label >', '</label>')

    # Regex for fixing spaces before `>` in opening tags: `class="..." >` -> `class="...">`
    content = re.sub(r'(["\'])\s+>', r'\1>', content)
    
    # Clean up `<!--Pitch -->` -> `<!--Pitch-->` if it exists
    content = content.replace('<!--Pitch -->', '<!--Pitch-->')
    content = content.replace('< !--', '<!--')

    print(f"Writing fixed content back to {filepath}...")
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done!")

if __name__ == '__main__':
    fix_html_spacing('js/ui.js')
