import re
import sys

with open('js/ui.js', 'r') as f:
    content = f.read()

# Fix tags starting with < div, < button, < tr, < style, < /div
fixed_content = content.replace('< div ', '<div ')
fixed_content = fixed_content.replace('< button ', '<button ')
fixed_content = fixed_content.replace('< tr >', '<tr>')
fixed_content = fixed_content.replace('< style >', '<style>')
fixed_content = fixed_content.replace('</span >', '</span>')
fixed_content = fixed_content.replace('</div >', '</div>')
fixed_content = fixed_content.replace('</button >', '</button>')
fixed_content = fixed_content.replace('</style >', '</style>')
fixed_content = fixed_content.replace('</tr >', '</tr>')

with open('js/ui.js', 'w') as f:
    f.write(fixed_content)

print("Tag spacing fixed.")
