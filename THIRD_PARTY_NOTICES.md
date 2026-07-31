# Third-party notices

## FrequencyWords

The English and Russian frequency data embedded in `dictionaries.js` is
adapted from the 2018 lists in
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
by Hermit Dave.

- Upstream commit:
  `525f9b560de45753a5ea01069454e72e9aa541c6`
- Source files: `content/2018/en/en_50k.txt` and
  `content/2018/ru/ru_50k.txt`
- Changes: entries containing characters outside the corresponding English
  or Russian alphabet were removed, and the remaining rows were embedded in
  a JavaScript module.
- Data license:
  [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)

The upstream repository identifies its code as MIT and its generated content
as CC BY-SA 4.0. This project uses the generated content. No endorsement by
the upstream author is implied.
