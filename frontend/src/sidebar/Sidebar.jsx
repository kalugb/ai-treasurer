import { NavLink } from "react-router-dom";
import { Settings } from "lucide-react";

const navItems = [
    {
        to: "/", label: "Chat",
    },
    {
        to: "/about", label: "About",
    }
]

function Sidebar() {
    return (
        <nav className="flex flex-col w-[10%] justify-between items-center h-screen bg-gray-200">
            <div className="flex flex-col gap-10 p-5 pt-5 justify-start items-center bg-gray-200">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => `mt-3 ${(isActive ? "text-blue-500" : "")}`}
                    >
                        {item.label}                    
                    </NavLink>
                ))}
            </div>

            <div className="flex flex-col gap-10 p-5 pt-5 w-[15%] justify-start items-center bg-gray-200">
                <NavLink
                    to="/settings"
                    className={({ isActive }) => `mt-3 flex items-center gap-2 whitespace-nowrap
                         ${(isActive ? "text-blue-500" : "")}`}
                >
                    <Settings size={24} />
                    Settings
                </NavLink>
            </div>
        </nav>
    )
}

export default Sidebar;