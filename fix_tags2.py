import re

with open('js/ui.js', 'r') as f:
    content = f.read()

fixed_content = content.replace('< b >', '<b>')
fixed_content = fixed_content.replace('</b >', '</b>')
fixed_content = fixed_content.replace('< td ', '<td ')
fixed_content = fixed_content.replace('</td >', '</td>')
fixed_content = fixed_content.replace('< th ', '<th ')
fixed_content = fixed_content.replace('</th >', '</th>')

with open('js/ui.js', 'w') as f:
    f.write(fixed_content)

print("More tags fixed.")
