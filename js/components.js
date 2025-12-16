/**
 * Component Loader - Loads HTML components into placeholder elements
 * Usage: Add <div data-component="component-name"></div> where you want the component
 */
(function() {
  'use strict';
  
  // Load components when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    loadComponents();
  });
  
  function loadComponents() {
    // Find all elements with data-component attribute
    var componentElements = document.querySelectorAll('[data-component]');
    
    componentElements.forEach(function(element) {
      var componentName = element.getAttribute('data-component');
      if (componentName) {
        loadComponent(element, componentName);
      }
    });
  }
  
  function loadComponent(element, componentName) {
    var componentPath = 'components/' + componentName + '.html';
    
    fetch(componentPath)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Component not found: ' + componentName);
        }
        return response.text();
      })
      .then(function(html) {
        // Insert the component HTML
        element.innerHTML = html;
        
        // Execute any scripts in the loaded component
        var scripts = element.querySelectorAll('script');
        scripts.forEach(function(script) {
          var newScript = document.createElement('script');
          if (script.src) {
            newScript.src = script.src;
          } else {
            newScript.textContent = script.textContent;
          }
          document.body.appendChild(newScript);
          script.remove();
        });
      })
      .catch(function(error) {
        console.error('Error loading component:', error);
      });
  }
})();
