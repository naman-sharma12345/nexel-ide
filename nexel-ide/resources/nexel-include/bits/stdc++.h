// Nexel shim: lets clang/libc++ (macOS) and MSVC/clang-cl (Windows) toolchains resolve #include <bits/stdc++.h>,
// which only GCC's libstdc++ ships. It mirrors libstdc++'s list; newer headers are guarded by __has_include.
#pragma once
// C compatibility
#include <cassert>
#include <cctype>
#include <cerrno>
#include <cfloat>
#include <climits>
#include <clocale>
#include <cmath>
#include <csetjmp>
#include <csignal>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <cwctype>
// C++ library
#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <complex>
#include <condition_variable>
#include <deque>
#include <exception>
#include <forward_list>
#include <fstream>
#include <functional>
#include <initializer_list>
#include <iomanip>
#include <ios>
#include <iosfwd>
#include <iostream>
#include <istream>
#include <iterator>
#include <limits>
#include <list>
#include <locale>
#include <map>
#include <memory>
#include <mutex>
#include <new>
#include <numeric>
#include <ostream>
#include <queue>
#include <random>
#include <ratio>
#include <regex>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <system_error>
#include <thread>
#include <tuple>
#include <type_traits>
#include <typeindex>
#include <typeinfo>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <valarray>
#include <vector>
#if __cplusplus >= 201703L
#if __has_include(<any>)
#include <any>
#endif
#if __has_include(<optional>)
#include <optional>
#endif
#if __has_include(<string_view>)
#include <string_view>
#endif
#if __has_include(<variant>)
#include <variant>
#endif
#if __has_include(<charconv>)
#include <charconv>
#endif
#endif
#if __cplusplus >= 202002L
#if __has_include(<bit>)
#include <bit>
#endif
#if __has_include(<compare>)
#include <compare>
#endif
#if __has_include(<concepts>)
#include <concepts>
#endif
#if __has_include(<numbers>)
#include <numbers>
#endif
#if __has_include(<ranges>)
#include <ranges>
#endif
#if __has_include(<span>)
#include <span>
#endif
#endif
#if __cplusplus > 202002L
#if __has_include(<expected>)
#include <expected>
#endif
#if __has_include(<print>)
#include <print>
#endif
#endif
