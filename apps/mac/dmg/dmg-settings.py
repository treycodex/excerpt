# dmgbuild settings for Excerpt.dmg. package-dmg.sh passes `app`, `readme` and
# `background` as defines. Icon positions must match the slots drawn in
# background.html, and the window size must match its 720x440 page.
import os.path

app = defines["app"]
readme = defines["readme"]

format = "UDZO"
filesystem = "HFS+"
size = None

files = [app, readme]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(os.path.dirname(app), "..", "Resources", "AppIcon.icns")
badge_icon = None

background = defines["background"]
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
# Finder counts the title bar in the height: 440 of background plus 32 of bar.
window_rect = ((200, 160), (720, 472))

default_view = "icon-view"
arrange_by = None
icon_size = 80
text_size = 13
label_pos = "bottom"
show_icon_preview = False
icon_locations = {
    os.path.basename(app): (150, 236),
    "Applications": (370, 236),
    os.path.basename(readme): (600, 236),
}
