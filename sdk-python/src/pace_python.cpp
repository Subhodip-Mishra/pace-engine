#include <pybind11/pybind11.h>
#include <pybind11/stl.h> 
#include "../../engine/include/pace_sdk.h"

namespace py = pybind11;

// Added "std::string org_id" as the 4th parameter
std::vector<bool> check_batch_python(std::vector<std::string> ips, int cap, int rate, std::string org_id) {
    int count = ips.size();
    std::vector<int> results(count, 0);
    std::vector<const char*> c_ips;
    c_ips.reserve(count);
    
    for (const auto& ip : ips) {
        c_ips.push_back(ip.c_str());
    }

    // Call engine with org_id (convert string to const char*)
    pace_check_batch(c_ips.data(), results.data(), count, cap, rate, org_id.c_str());

    std::vector<bool> bool_results;
    bool_results.reserve(count);
    for (int r : results) {
        bool_results.push_back(r == 1);
    }
    
    return bool_results;
}

PYBIND11_MODULE(pace_native, m) {
    m.def("check_batch", &check_batch_python, "Check a batch of IPs against the rate limiter");
}