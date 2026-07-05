import { NavLink } from "react-router-dom";
import { useState } from "react";

const navItems = [
    {
        to: "/", label: "Home",
    },
    {
        to: "/about", label: "About",
    }
]

function Sidebar() {
    return (
        <nav className="flex flex-col gap-10 p-4 w-[10%] justify-start items-center bg-gray-200">
            {navItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => isActive ? "text-blue-500" : ""}
                >
                    {item.label}                    
                </NavLink>
            ))}
        </nav>
    )
}

export default Sidebar;