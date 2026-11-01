import React, { useState } from 'react';
import './NavDock.css';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavDockProps {
  activeSection: string;
  onSelect: (id: string) => void;
  sidebarCollapsed?: boolean;
  /** Extra dock entries contributed by enabled plugins. */
  pluginItems?: NavItem[];
}

export const NavDock: React.FC<NavDockProps> = ({ activeSection, onSelect, sidebarCollapsed, pluginItems = [] }) => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isDockHovered, setIsDockHovered] = useState<boolean>(false);

  const navItems: NavItem[] = [
    {
      id: 'workspace',
      label: 'Workspace Explorer',
      icon: (
        <svg className="nd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    ...pluginItems,
  ];

  return (
    <div className="nd-wrapper-axis">
      <div 
        className={`nd-dock ${isDockHovered ? 'nd-dock-expanded' : ''}`}
        onMouseEnter={() => setIsDockHovered(true)}
        onMouseLeave={() => {
          setIsDockHovered(false);
          setHoveredItem(null);
        }}
      >
        {/* Top Accent Hardware Pin with Pulse effect */}
        <div className="nd-hardware-pin top-pin">
          <div className="nd-dot pulsing" />
        </div>

        {/* Navigation Core stack */}
        <div className="nd-items-stack">
          {navItems.map((item) => {
            const isItemHovered = hoveredItem === item.id;
            const isItemActive = activeSection === item.id && !(item.id === 'workspace' && sidebarCollapsed);

            return (
              <div
                key={item.id}
                className={`nd-item-row ${isItemHovered ? 'nd-row-hovered' : ''} ${isItemActive ? 'nd-row-active' : ''}`}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => onSelect(item.id)}
              >
                {/* Neon Tube Active Indicator Pillar */}
                <div className="nd-active-indicator" />

                <div className="nd-capsule-container">
                  <div className="nd-glow-layer" />
                  <div className="nd-icon-fluid">
                    {item.icon}
                  </div>
                </div>

                {/* Cyberpunk Glass Tooltip */}
                <div className="nd-tooltip">
                  <span className="nd-tooltip-text">{item.label}</span>
                  <div className="nd-tooltip-indicator" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Shuriken Action */}
        <div className="nd-footer-action">
          <div className="nd-footer-shuriken">
            <svg className="nd-shuriken-icon" viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" clipRule="evenodd">
              <path d="M 12 2 Q 12 12 22 12 Q 12 12 12 22 Q 12 12 2 12 Q 12 12 12 2 Z M 12 9.5 A 2.5 2.5 0 1 0 12 14.5 A 2.5 2.5 0 1 0 12 9.5 Z" />
            </svg>
          </div>
          
          <div className="nd-hardware-pin bottom-pin">
            <div className="nd-dot" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavDock;
