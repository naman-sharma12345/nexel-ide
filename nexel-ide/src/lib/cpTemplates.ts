// Fast I/O competitive-programming starter templates.
export const CPP_TEMPLATE = `#include <bits/stdc++.h>
using namespace std;
using ll = long long;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int t = 1;
    // cin >> t;
    while (t--) {

    }
    return 0;
}
`;
export function templateFor(ext: string): string {
  return ext.toLowerCase() === 'cpp' ? CPP_TEMPLATE : '';
}
