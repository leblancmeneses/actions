1. Add more parser tests:

md-exp:  "abc" "xyz" !'what';

abc_exp:  "abc" !"xyz" 'what';

combine: abc_exp 'leblanc';

hello: 'testing';


2. advance features:

<md-exp>:  "abc" "xyz" !'what';

abc_exp:  "abc" !"xyz" 'what';

combine: abc_exp 'leblanc';

[hello](./use/nested/folder): 'testing';